
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType
} from "discord.js";
import * as cheerio from "cheerio";

const NEWS_GG_BOT_ID = process.env.NEWS_GG_BOT_ID;
const SETTINGS_COLLECTION = "newsChannelSettings";
const NEWS_GG_HOST = "newsdiscordbot.xyz";

export const data = new SlashCommandBuilder()
    .setName("set_news_channel")
    .setDescription("このチャンネルのNews.ggニュース監視を切り替える")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild);

/**
 * 監視チャンネルの切り替え
 */
export async function execute(interaction, { client }) {
    if (!interaction.guild || !interaction.channel) {
        await interaction.reply({
            content: "サーバーのテキストチャンネルで実行してください。",
            ephemeral: true
        });
        return;
    }

    if (!NEWS_GG_BOT_ID) {
        await interaction.reply({
            content: "NEWS_GG_BOT_ID が設定されていません。.envを確認してください。",
            ephemeral: true
        });
        return;
    }

    const guildId = interaction.guild.id;
    const channelId = interaction.channel.id;
    const collection = client.db.collection(SETTINGS_COLLECTION);

    try {
        const existing = await collection.findOne({
            guildId,
            channelId
        });

        if (existing) {
            await collection.deleteMany({
                guildId,
                channelId
            });

            const settings = await collection
                .find({ guildId })
                .toArray();

            const mentions = settings.map(
                setting => `<#${setting.channelId}>`
            );

            await interaction.reply({
                content: settings.length
                    ? `このチャンネルのNews.gg監視を解除しました。\n監視チャンネル: ${mentions.join(" ")}`
                    : "このチャンネルのNews.gg監視を解除しました。現在、監視中のチャンネルはありません。",
                ephemeral: true
            });

            return;
        }

        try {
            await interaction.guild.members.fetch(NEWS_GG_BOT_ID);
        } catch (error) {
            console.error(
                "[News.gg] Bot member fetch failed:",
                error.message
            );

            await interaction.reply({
                content: "News.ggがサーバーに参加していません。",
                ephemeral: true
            });

            return;
        }

        await collection.updateOne(
            { guildId, channelId },
            {
                $set: {
                    guildId,
                    channelId,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );

        const settings = await collection
            .find({ guildId })
            .toArray();

        const mentions = settings.map(
            setting => `<#${setting.channelId}>`
        );

        await interaction.reply({
            content: `監視チャンネルを ${mentions.join(" ")} に設定しました。`,
            ephemeral: true
        });
    } catch (error) {
        console.error(
            "[News.gg] Settings update failed:",
            error
        );

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "News.gg監視設定の更新に失敗しました。データベースを確認してください。",
                ephemeral: true
            });
        }
    }
}

/**
 * URLを正規化してSetに追加
 */
function addUrl(value, urls) {
    if (typeof value !== "string" || !value) return;

    const cleaned = value
        .trim()
        .replace(/\\&/g, "&")
        .replace(/&amp;/gi, "&")
        .replace(/[),.!?;:}\]]+$/, "");

    try {
        const parsed = new URL(cleaned);

        if (
            parsed.protocol === "https:" ||
            parsed.protocol === "http:"
        ) {
            urls.add(parsed.href);
        }
    } catch {
        // 不正なURLは無視
    }
}

/**
 * Markdownリンクと通常URLを抽出
 */
function extractUrlsFromText(value, urls) {
    if (typeof value !== "string" || !value) return;

    // MarkdownリンクのURL部分を取得
    const markdownPattern =
        /\]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/gi;

    for (const match of value.matchAll(markdownPattern)) {
        addUrl(match[1], urls);
    }

    // Markdownリンクを除いて、通常URLを取得
    const withoutMarkdown = value.replace(
        /\[([^\]]*)\]\(\s*<?https?:\/\/[^)\s>]+>?\s*\)/gi,
        ""
    );

    const pattern = /https?:\/\/[^\s<>"'()[\]]+/gi;

    for (const match of withoutMarkdown.matchAll(pattern)) {
        addUrl(match[0], urls);
    }
}

/**
 * Components V2を再帰的に走査してURLを抽出
 */
function extractComponentUrls(components, urls) {
    for (const component of components ?? []) {
        if (!component) continue;

        extractUrlsFromText(component.content, urls);
        extractUrlsFromText(component.url, urls);

        if (component.accessory) {
            extractComponentUrls([component.accessory], urls);
        }

        if (component.components) {
            extractComponentUrls(component.components, urls);
        }
    }
}

/**
 * Components V2からテキストを抽出
 */
function extractComponentTexts(components, texts = []) {
    for (const component of components ?? []) {
        if (!component) continue;

        if (
            typeof component.content === "string" &&
            component.content.trim()
        ) {
            texts.push(
                component.content
                    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
                    .replace(/\s+/g, " ")
                    .trim()
            );
        }

        if (component.accessory) {
            extractComponentTexts([component.accessory], texts);
        }

        if (component.components) {
            extractComponentTexts(component.components, texts);
        }
    }

    return texts;
}

/**
 * Discordメッセージ全体からURLを抽出
 */
function extractUrls(message) {
    const urls = new Set();

    extractUrlsFromText(message.content, urls);

    for (const embed of message.embeds ?? []) {
        extractUrlsFromText(embed.url, urls);
        extractUrlsFromText(embed.title, urls);
        extractUrlsFromText(embed.description, urls);
        extractUrlsFromText(embed.author?.name, urls);
        extractUrlsFromText(embed.author?.url, urls);
        extractUrlsFromText(embed.footer?.text, urls);
        extractUrlsFromText(embed.thumbnail?.url, urls);
        extractUrlsFromText(embed.image?.url, urls);
        extractUrlsFromText(embed.video?.url, urls);
        extractUrlsFromText(embed.provider?.name, urls);
        extractUrlsFromText(embed.provider?.url, urls);

        for (const field of embed.fields ?? []) {
            extractUrlsFromText(field.name, urls);
            extractUrlsFromText(field.value, urls);
        }
    }

    extractComponentUrls(message.components, urls);

    for (const attachment of message.attachments?.values() ?? []) {
        extractUrlsFromText(attachment.url, urls);
    }

    return [...urls];
}

/**
 * News.ggのURLか判定
 */
function isNewsGgUrl(url) {
    try {
        const hostname = new URL(url).hostname.toLowerCase();

        return (
            hostname === NEWS_GG_HOST ||
            hostname.endsWith(`.${NEWS_GG_HOST}`)
        );
    } catch {
        return false;
    }
}

/**
 * Google NewsのURLか判定
 */
function isGoogleNewsUrl(url) {
    try {
        const hostname = new URL(url).hostname.toLowerCase();

        return (
            hostname === "news.google.com" ||
            hostname.endsWith(".news.google.com")
        );
    } catch {
        return false;
    }
}

/**
 * タイトルを整形
 */
function cleanTitle(value) {
    if (typeof value !== "string") return null;

    const title = value
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/\s+/g, " ")
        .trim();

    return title || null;
}

/**
 * JSON-LDからタイトルを取得
 */
function extractJsonLdTitle($) {
    let result = null;

    $('script[type="application/ld+json"]').each((_, element) => {
        if (result) return;

        const raw = $(element).contents().text();
        if (!raw) return;

        try {
            const data = JSON.parse(raw);
            const objects = Array.isArray(data) ? data : [data];

            for (const object of objects) {
                const candidates = [
                    object?.headline,
                    object?.name,
                    object?.mainEntity?.headline,
                    object?.mainEntityOfPage?.name
                ];

                for (const candidate of candidates) {
                    const title = cleanTitle(candidate);

                    if (title) {
                        result = title;
                        return;
                    }
                }

                if (Array.isArray(object?.["@graph"])) {
                    for (const item of object["@graph"]) {
                        const title = cleanTitle(
                            item?.headline || item?.name
                        );

                        if (title) {
                            result = title;
                            return;
                        }
                    }
                }
            }
        } catch {
            // 壊れたJSON-LDは無視
        }
    });

    return result;
}

/**
 * ページからタイトルを抽出
 */
function extractTitle($) {
    const candidates = [
        $('meta[property="og:title"]').attr("content"),
        $('meta[name="twitter:title"]').attr("content"),
        $('meta[name="title"]').attr("content"),
        extractJsonLdTitle($),
        $("article h1").first().text(),
        $("main h1").first().text(),
        $("h1").first().text(),
        $("title").first().text()
    ];

    for (const candidate of candidates) {
        const title = cleanTitle(candidate);

        if (title) return title;
    }

    return null;
}

/**
 * News.ggのタイトルからサイト名などを除去
 */
function cleanNewsGgTitle(title) {
    return cleanTitle(title)
        ?.replace(/\s*\|\s*News\.gg\s*$/i, "")
        ?.replace(/\s*-\s*News\.gg\s*$/i, "")
        ?.replace(/\s*\|\s*Reuters\s*$/i, "")
        ?.trim() || null;
}

/**
 * News.ggの記事ページからリンクを抽出する。
 *
 * Google Newsのリンクがあれば優先して返す。
 * なければ、Read full articleなどの直接リンクを返す。
 * 元記事サイトやGoogle Newsの内部APIにはアクセスしない。
 */
function extractSourceUrl($, pageUrl) {
    const candidates = [];

    $("a[href]").each((_, element) => {
        const href = $(element).attr("href");
        if (!href) return;

        const text = $(element)
            .text()
            .replace(/\s+/g, " ")
            .trim();

        if (
            !/read\s+full\s+article|original\s+article|full\s+story|read\s+more|元記事|記事を読む|全文を読む|続きを読む/i.test(
                text
            )
        ) {
            return;
        }

        try {
            const url = new URL(href, pageUrl);

            if (!["http:", "https:"].includes(url.protocol)) {
                return;
            }

            if (isNewsGgUrl(url.href)) return;

            candidates.push({
                text,
                url: url.href
            });
        } catch {
            // 不正なURLは無視
        }
    });

    console.log("[News.gg] Source link candidates:", candidates);

    // Google Newsのリンクがある場合は、必ずGoogle Newsを優先
    const googleNewsLink = candidates.find(
        item => isGoogleNewsUrl(item.url)
    );

    if (googleNewsLink) {
        console.log(
            "[News.gg] Google News URL found:",
            googleNewsLink.url
        );

        return googleNewsLink.url;
    }

    // Google Newsがなければ直接リンクを使う
    const directLink = candidates.find(
        item => !isGoogleNewsUrl(item.url)
    );

    if (directLink) {
        console.log(
            "[News.gg] Direct source URL found:",
            directLink.url
        );

        return directLink.url;
    }

    console.log("[News.gg] No source link found.");
    return null;
}

/**
 * News.ggの記事ページからタイトルとリンクを取得
 * 外部サイトにはアクセスしない
 */
async function extractArticle(articlePageUrl, message) {
    console.log(
        "[News.gg] Fetching News.gg article:",
        articlePageUrl
    );

    const response = await fetch(articlePageUrl, {
        signal: AbortSignal.timeout(20000),
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/131.0.0.0 Safari/537.36",
            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,ja;q=0.8"
        },
        redirect: "follow"
    });

    if (!response.ok) {
        throw new Error(
            `News.gg HTTP ${response.status}: ${response.url}`
        );
    }

    // 外部サイトへリダイレクトした場合は取得しない
    if (!isNewsGgUrl(response.url)) {
        throw new Error(
            `Unexpected redirect destination: ${response.url}`
        );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const newsGgTitle = cleanNewsGgTitle(extractTitle($));

    const componentTexts = extractComponentTexts(
        message.components
    );

    const componentTitle = componentTexts.find(text =>
        text.length >= 15 &&
        !/read full article|original article|full story|invite|join server/i.test(text)
    );

    const title =
        newsGgTitle ||
        cleanTitle(componentTitle) ||
        "News.gg News";

    const sourceUrl = extractSourceUrl($, response.url)
        || response.url;

    const article = {
        title,
        sourceUrl
    };

    console.log("[News.gg] Article result:", article);

    return article;
}

/**
 * News.gg投稿を監視して再投稿する
 */
export async function handleMessage(message, client) {
    if (!message.guild || !NEWS_GG_BOT_ID) return;
    if (message.author.id !== NEWS_GG_BOT_ID) return;

    console.log("[News.gg] Target message detected:", {
        guildId: message.guild.id,
        channelId: message.channel.id,
        messageId: message.id,
        content: message.content,
        embeds: message.embeds.length,
        components: message.components.length
    });

    try {
        const settings = await client.db
            .collection(SETTINGS_COLLECTION)
            .findOne({
                guildId: message.guild.id,
                channelId: message.channel.id
            });

        if (!settings) return;

        const urls = extractUrls(message);

        console.log("[News.gg] Extracted URLs:", urls);

        const articlePageUrl = urls.find(url => {
            try {
                const parsed = new URL(url);

                return (
                    parsed.hostname.toLowerCase() === NEWS_GG_HOST &&
                    parsed.pathname.startsWith("/articles/")
                );
            } catch {
                return false;
            }
        });

        if (!articlePageUrl) {
            console.warn("[News.gg] News.gg article URL not found.");
            return;
        }

        let article;

        try {
            article = await extractArticle(articlePageUrl, message);
        } catch (error) {
            console.error(
                "[News.gg] Article extraction failed:",
                error.message
            );

            const componentTexts = extractComponentTexts(
                message.components
            );

            const fallbackTitle = componentTexts.find(text =>
                text.length >= 15 &&
                !/read full article|original article|full story|invite|join server/i.test(text)
            );

            article = {
                title: cleanTitle(fallbackTitle) || "News.gg News",
                sourceUrl: articlePageUrl
            };
        }

        if (
            !article.title ||
            !/^https?:\/\//i.test(article.sourceUrl)
        ) {
            console.error(
                "[News.gg] Invalid article data:",
                article
            );
            return;
        }

        // 再投稿に成功した場合のみ元メッセージを削除
        const sentMessage = await message.channel.send({
            content: `**${article.title}**\n${article.sourceUrl}`,
            allowedMentions: {
                parse: []
            }
        });

        console.log(
            "[News.gg] Article reposted:",
            sentMessage.id
        );

        try {
            await message.delete();

            console.log(
                "[News.gg] Original message deleted:",
                message.id
            );
        } catch (error) {
            console.error(
                "[News.gg] Original message deletion failed:",
                error.message
            );
        }
    } catch (error) {
        console.error(
            "[News.gg] Message processing failed:",
            error
        );
    }
}
