
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

        // 監視中なら解除する
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

        // News.gg Botがサーバーにいるか確認する
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

        // 監視設定を登録する
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
 * URLを安全に追加する
 */
function addUrl(url, urls) {
    if (typeof url !== "string" || !url) return;

    const cleanedUrl = url.replace(/[),.!?;:}\]]+$/, "");

    try {
        const parsedUrl = new URL(cleanedUrl);

        if (
            parsedUrl.protocol === "http:" ||
            parsedUrl.protocol === "https:"
        ) {
            urls.add(parsedUrl.href);
        }
    } catch {
        // 不正なURLは無視
    }
}

/**
 * テキストから通常のURLとMarkdownリンクのURLを抽出する
 */
function extractUrlsFromText(value, urls) {
    if (typeof value !== "string" || !value) return;

    // Markdownリンク: [タイトル](https://example.com)
    const markdownPattern =
        /\]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/gi;

    for (const match of value.matchAll(markdownPattern)) {
        addUrl(match[1], urls);
    }

    // 通常のURL
    const pattern = /https?:\/\/[^\s<>"']+/gi;

    for (const match of value.matchAll(pattern)) {
        addUrl(match[0], urls);
    }
}

/**
 * Components V2を含むコンポーネントを再帰的に走査する
 */
function extractComponentUrls(components, urls) {
    for (const component of components ?? []) {
        if (!component) continue;

        // テキストやリンクボタンのURL
        extractUrlsFromText(component.content, urls);
        extractUrlsFromText(component.url, urls);

        // アクセサリー（画像など）
        if (component.accessory) {
            extractComponentUrls(
                [component.accessory],
                urls
            );
        }

        // コンテナ、セクション、アクション行などの子要素
        if (component.components) {
            extractComponentUrls(
                component.components,
                urls
            );
        }
    }
}

/**
 * Discordメッセージ全体からURLを抽出する
 */
function extractUrls(message) {
    const urls = new Set();

    // 通常のメッセージ本文
    extractUrlsFromText(message.content, urls);

    // 通常のEmbed
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
 * URLからHTMLを取得する
 */
async function fetchPage(url) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
            "User-Agent":
                "Mozilla/5.0 (compatible; NewsArticleBot/1.0)"
        },
        redirect: "follow"
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${url}`);
    }

    return {
        html: await response.text(),
        url: response.url
    };
}

/**
 * 記事タイトルを抽出する
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

        if (title) return title;
    }

    return null;
}

/**
 * News.ggの記事ページから元記事URLを抽出する
 */
function extractSourceUrl($, pageUrl) {
    let sourceUrl = null;

    $('a[href]').each((_, element) => {
        if (sourceUrl) return;

        const href = $(element).attr("href");

        if (!href) return;

        const linkText = $(element)
            .text()
            .replace(/\s+/g, " ")
            .trim();

        // 元記事へのリンクを判定
        const isArticleLink =
            /read\s+full\s+article/i.test(linkText) ||
            /original\s+article/i.test(linkText) ||
            /元記事|記事を読む|全文を読む/.test(linkText);

        if (!isArticleLink) return;

        try {
            const parsedUrl = new URL(href, pageUrl);

            if (
                ["http:", "https:"].includes(parsedUrl.protocol) &&
                parsedUrl.hostname.toLowerCase() !== NEWS_GG_HOST
            ) {
                sourceUrl = parsedUrl.href;
            }
        } catch {
            // 不正なURLは無視
        }
    });

    return sourceUrl;
}

/**
 * News.ggの記事ページから元記事のタイトルとURLを取得する
 */
async function extractArticle(articlePageUrl) {
    console.log(
        "[News.gg] Fetching article page:",
        articlePageUrl
    );

    const articlePage = await fetchPage(articlePageUrl);
    const $ = cheerio.load(articlePage.html);

    const sourceUrl = extractSourceUrl(
        $,
        articlePage.url
    );

    if (!sourceUrl) {
        console.warn(
            "[News.gg] Source article link not found:",
            articlePage.url
        );

        return null;
    }

    console.log(
        "[News.gg] Fetching source article:",
        sourceUrl
    );

    const sourcePage = await fetchPage(sourceUrl);
    const sourcePage$ = cheerio.load(sourcePage.html);
    const title = extractTitle(sourcePage$);

    if (!title) {
        console.warn(
            "[News.gg] Article title not found:",
            sourcePage.url
        );

        return null;
    }

    return {
        title,
        sourceUrl: sourcePage.url
    };
}

/**
 * News.ggのニュース投稿を監視する
 */
export async function handleMessage(message, client) {
    if (!message.guild || !NEWS_GG_BOT_ID) return;

    // News.gg Botの投稿だけを処理する
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
        // このチャンネルが監視対象か確認する
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

        // 本文、Embed、Components V2からURLを抽出
        const urls = extractUrls(message);

        console.log(
            "[News.gg] Extracted URLs:",
            urls
        );

        // News.ggの記事ページを特定する
        const articlePageUrl = urls.find(url => {
            try {
                const parsedUrl = new URL(url);

                return (
                    parsedUrl.hostname.toLowerCase() === NEWS_GG_HOST &&
                    /^\/articles\/article-[^/]+/.test(parsedUrl.pathname)
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

        // 記事タイトルと元記事URLを取得
        const article = await extractArticle(articlePageUrl);

        if (!article) {
            console.warn(
                "[News.gg] Article extraction returned no result."
            );

            return;
        }

        // 元記事をチャンネルに投稿
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

        // 再投稿成功後に元のNews.gg投稿を削除
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
