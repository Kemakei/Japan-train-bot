
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

        // 監視中なら解除
        if (existing) {
            await collection.deleteMany({
                guildId,
                channelId
            });

            const settings = await collection
                .find({ guildId })
                .toArray();

            const channelMentions = settings.map(
                setting => `<#${setting.channelId}>`
            );

            await interaction.reply({
                content: settings.length
                    ? `このチャンネルのNews.gg監視を解除しました。\n監視チャンネル: ${channelMentions.join(" ")}`
                    : "このチャンネルのNews.gg監視を解除しました。現在、監視中のチャンネルはありません。",
                ephemeral: true
            });

            return;
        }

        // News.gg Botの参加を確認
        try {
            await interaction.guild.members.fetch(NEWS_GG_BOT_ID);
        } catch (error) {
            console.error(
                "[News.gg] Bot member fetch failed:",
                error
            );

            await interaction.reply({
                content: "News.ggがサーバーに参加していません。",
                ephemeral: true
            });

            return;
        }

        // 監視設定を保存
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

        const channelMentions = settings.map(
            setting => `<#${setting.channelId}>`
        );

        await interaction.reply({
            content: `監視チャンネルを ${channelMentions.join(" ")} に設定しました。`,
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
 * URLをSetに追加
 */
function addUrl(value, urls) {
    if (typeof value !== "string" || !value) return;

    const cleaned = value
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
 * テキストから通常URLとMarkdownリンクを抽出
 */
function extractUrlsFromText(value, urls) {
    if (typeof value !== "string" || !value) return;

    // Markdownリンク: [タイトル](URL)
    const markdownPattern =
        /\]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/gi;

    for (const match of value.matchAll(markdownPattern)) {
        addUrl(match[1], urls);
    }

    // Markdownリンク全体を除外して通常URLを抽出
    const textWithoutMarkdown = value.replace(
        /\[([^\]]*)\]\(\s*<?https?:\/\/[^)\s>]+>?\s*\)/gi,
        ""
    );

    const pattern = /https?:\/\/[^\s<>"'()[\]]+/gi;

    for (const match of textWithoutMarkdown.matchAll(pattern)) {
        addUrl(match[0], urls);
    }
}

/**
 * Components V2を再帰的に走査
 */
function extractComponentUrls(components, urls) {
    for (const component of components ?? []) {
        if (!component) continue;

        extractUrlsFromText(component.content, urls);
        extractUrlsFromText(component.url, urls);

        if (component.accessory) {
            extractComponentUrls(
                [component.accessory],
                urls
            );
        }

        if (component.components) {
            extractComponentUrls(
                component.components,
                urls
            );
        }
    }
}

/**
 * Discordメッセージ全体からURLを抽出
 */
function extractUrls(message) {
    const urls = new Set();

    extractUrlsFromText(message.content, urls);

    // Embed
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

    // Components V2
    extractComponentUrls(message.components, urls);

    // 添付ファイル
    for (const attachment of message.attachments?.values() ?? []) {
        extractUrlsFromText(attachment.url, urls);
    }

    return [...urls];
}

/**
 * Webページを取得
 */
async function fetchPage(url) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/130.0.0.0 Safari/537.36",
            "Accept":
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        redirect: "follow"
    });

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}: ${response.url}`
        );
    }

    return {
        html: await response.text(),
        url: response.url
    };
}

/**
 * ページタイトルを抽出
 */
function extractTitle($) {
    const candidates = [
        $('meta[property="og:title"]').attr("content"),
        $('meta[name="twitter:title"]').attr("content"),
        $("article h1").first().text(),
        $("main h1").first().text(),
        $("h1").first().text(),
        $("title").first().text()
    ];

    for (const candidate of candidates) {
        const title = candidate
            ?.replace(/\s+/g, " ")
            .trim();

        if (title) {
            return title;
        }
    }

    return null;
}

/**
 * URLがNews.gg内部のURLか判定
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
 * Google NewsのURLから元記事URLを探す
 *
 * リダイレクト先、埋め込みURL、ページ内リンクを調べる。
 * Google側の仕様によっては取得できない場合がある。
 */
async function resolveGoogleNewsUrl(googleUrl) {
    console.log(
        "[News.gg] Resolving Google News URL:",
        googleUrl
    );

    try {
        const page = await fetchPage(googleUrl);

        // HTTPリダイレクト後に外部記事へ移動していた場合
        if (
            !isGoogleNewsUrl(page.url) &&
            !isNewsGgUrl(page.url)
        ) {
            console.log(
                "[News.gg] Google News redirect destination:",
                page.url
            );

            return page.url;
        }

        const $ = cheerio.load(page.html);
        const candidates = new Set();

        // Google NewsのHTML内にあるリンクを調べる
        $("a[href], [data-n-au], [data-url]").each((_, element) => {
            const values = [
                $(element).attr("href"),
                $(element).attr("data-n-au"),
                $(element).attr("data-url")
            ];

            for (const value of values) {
                if (!value) continue;

                try {
                    const parsed = new URL(value, page.url);

                    // URLパラメータに元記事URLが入っている場合
                    for (const key of [
                        "url",
                        "u",
                        "article_url",
                        "target"
                    ]) {
                        const nestedUrl = parsed.searchParams.get(key);

                        if (
                            nestedUrl &&
                            /^https?:\/\//i.test(nestedUrl) &&
                            !isGoogleNewsUrl(nestedUrl) &&
                            !isNewsGgUrl(nestedUrl)
                        ) {
                            candidates.add(nestedUrl);
                        }
                    }

                    if (
                        ["http:", "https:"].includes(parsed.protocol) &&
                        !isGoogleNewsUrl(parsed.href) &&
                        !isNewsGgUrl(parsed.href)
                    ) {
                        candidates.add(parsed.href);
                    }
                } catch {
                    // 不正なURLは無視
                }
            }
        });

        const externalUrls = [...candidates];

        console.log(
            "[News.gg] Google News external links:",
            externalUrls
        );

        // Google News内のナビゲーションではなく、
        // 外部ニュースサイトのリンクを優先する
        const newsDomains = [
            "reuters.com",
            "apnews.com",
            "bbc.com",
            "bbc.co.uk",
            "nytimes.com",
            "theguardian.com",
            "cnn.com",
            "nhk.or.jp",
            "yomiuri.co.jp"
        ];

        const preferred = externalUrls.find(url => {
            try {
                const hostname = new URL(url).hostname.toLowerCase();

                return newsDomains.some(domain =>
                    hostname === domain ||
                    hostname.endsWith(`.${domain}`)
                );
            } catch {
                return false;
            }
        });

        if (preferred) {
            console.log(
                "[News.gg] Preferred publisher URL found:",
                preferred
            );

            return preferred;
        }

        // ニュースサイトのドメインを特定できない場合は、
        // Google Newsから得られた外部URLを使用する
        if (externalUrls.length > 0) {
            console.log(
                "[News.gg] Using external Google News link:",
                externalUrls[0]
            );

            return externalUrls[0];
        }

        console.warn(
            "[News.gg] Original publisher URL not found in Google News."
        );

        return null;
    } catch (error) {
        console.warn(
            "[News.gg] Google News resolution failed:",
            error.message
        );

        return null;
    }
}

/**
 * News.ggページから元記事URLを抽出
 */
function extractSourceUrl($, pageUrl) {
    const candidates = [];

    $("a[href]").each((_, element) => {
        const href = $(element).attr("href");

        if (!href) return;

        const linkText = $(element)
            .text()
            .replace(/\s+/g, " ")
            .trim();

        try {
            const parsed = new URL(href, pageUrl);

            if (
                !["http:", "https:"].includes(parsed.protocol)
            ) {
                return;
            }

            if (isNewsGgUrl(parsed.href)) {
                return;
            }

            candidates.push({
                text: linkText,
                url: parsed.href
            });
        } catch {
            // 不正なURLは無視
        }
    });

    // Read full articleのリンクを優先
    const source = candidates.find(item =>
        /read\s+full\s+article/i.test(item.text)
    );

    if (source) {
        console.log(
            "[News.gg] Source article link found:",
            source
        );

        return source.url;
    }

    // 別表記にも対応
    const alternate = candidates.find(item =>
        /original\s+article|read\s+more|full\s+story|元記事|記事を読む|全文を読む|続きを読む/i.test(
            item.text
        )
    );

    if (alternate) {
        console.log(
            "[News.gg] Alternative source link found:",
            alternate
        );

        return alternate.url;
    }

    console.warn(
        "[News.gg] Source article link not found.",
        {
            pageUrl,
            externalLinks: candidates
        }
    );

    return null;
}

/**
 * News.ggページから元記事を取得する。
 *
 * 元記事リンクがGoogle Newsの場合は遷移先を探す。
 * 元記事リンクや元記事タイトルを取得できない場合は、
 * News.ggのタイトルと記事URLを使用する。
 */
async function extractArticle(articlePageUrl) {
    console.log(
        "[News.gg] Fetching article page:",
        articlePageUrl
    );

    // News.gg記事ページの取得は必須
    const articlePage = await fetchPage(articlePageUrl);
    const $ = cheerio.load(articlePage.html);

    console.log(
        "[News.gg] News.gg page title:",
        $("title").text()
    );

    // News.ggタイトルを先に取得しておく
    const newsGgTitle = extractTitle($)
        ?.replace(/\s*\|\s*News\.gg\s*$/i, "")
        .trim();

    // News.ggページ内の元記事リンクを取得
    let sourceUrl = extractSourceUrl(
        $,
        articlePage.url
    );

    // 元記事リンクが見つからない場合の診断情報
    if (!sourceUrl) {
        console.warn(
            "[News.gg] Page link diagnostics:",
            $("a[href]")
                .map((_, element) => ({
                    text: $(element)
                        .text()
                        .replace(/\s+/g, " ")
                        .trim(),
                    href: $(element).attr("href")
                }))
                .get()
        );

        console.warn(
            "[News.gg] Canonical URL:",
            $('link[rel="canonical"]').attr("href")
        );

        console.warn(
            "[News.gg] Open Graph URL:",
            $('meta[property="og:url"]').attr("content")
        );

        // 元記事リンクが見つからない場合はNews.gg記事を投稿
        if (newsGgTitle) {
            return {
                title: newsGgTitle,
                sourceUrl: articlePage.url
            };
        }

        return null;
    }

    // Google News経由の場合、出版社のURLを探す
    if (isGoogleNewsUrl(sourceUrl)) {
        const publisherUrl = await resolveGoogleNewsUrl(sourceUrl);

        if (publisherUrl) {
            sourceUrl = publisherUrl;
        } else {
            console.warn(
                "[News.gg] Could not resolve Google News publisher URL."
            );

            // 元記事URLが解決できなければNews.gg記事を投稿
            if (newsGgTitle) {
                return {
                    title: newsGgTitle,
                    sourceUrl: articlePage.url
                };
            }

            return null;
        }
    }

    console.log(
        "[News.gg] Fetching source article:",
        sourceUrl
    );

    // 元記事サイトの取得に失敗してもフォールバックする
    try {
        const sourcePage = await fetchPage(sourceUrl);
        const sourcePage$ = cheerio.load(sourcePage.html);

        const title = extractTitle(sourcePage$);

        if (title) {
            return {
                title,
                sourceUrl: sourcePage.url
            };
        }

        console.warn(
            "[News.gg] Source title not found. Using News.gg title:",
            sourcePage.url
        );
    } catch (error) {
        console.warn(
            "[News.gg] Source page fetch failed. Using News.gg title:",
            sourceUrl,
            error.message
        );
    }

    if (newsGgTitle) {
        return {
            title: newsGgTitle,
            sourceUrl
        };
    }

    console.warn(
        "[News.gg] Neither source title nor News.gg title was found."
    );

    return null;
}

/**
 * News.ggニュース投稿の監視処理
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
        // 監視対象チャンネルか確認
        const settings = await client.db
            .collection(SETTINGS_COLLECTION)
            .findOne({
                guildId: message.guild.id,
                channelId: message.channel.id
            });

        if (!settings) {
            console.log(
                "[News.gg] Channel is not monitored:",
                message.channel.id
            );

            return;
        }

        // メッセージからURLを抽出
        const urls = extractUrls(message);

        console.log(
            "[News.gg] Extracted URLs:",
            urls
        );

        // newsdiscordbot.xyz の記事URLを抽出
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
            console.warn(
                "[News.gg] News article URL not found."
            );

            return;
        }

        // 元記事を取得。失敗した場合はNews.ggタイトルを使用
        const article = await extractArticle(
            articlePageUrl
        );

        if (!article) {
            console.warn(
                "[News.gg] Article extraction returned no result."
            );

            return;
        }

        // 元記事のタイトルとURLを投稿
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

        // 再投稿成功後に元メッセージを削除
        try {
            await message.delete();

            console.log(
                "[News.gg] Original message deleted:",
                message.id
            );
        } catch (error) {
            console.error(
                "[News.gg] Original message deletion failed:",
                error
            );
        }
    } catch (error) {
        console.error(
            "[News.gg] Message processing failed:",
            error
        );
    }
}
