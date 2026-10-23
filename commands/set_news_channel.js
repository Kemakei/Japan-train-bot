
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
        console.error("[News.gg] Settings update failed:", error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "News.gg監視設定の更新に失敗しました。データベースを確認してください。",
                ephemeral: true
            });
        }
    }
}

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
        // 無効なURLは無視
    }
}

function extractUrlsFromText(value, urls) {
    if (typeof value !== "string" || !value) return;

    const markdownPattern =
        /\]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/gi;

    for (const match of value.matchAll(markdownPattern)) {
        addUrl(match[1], urls);
    }

    const withoutMarkdown = value.replace(
        /\[([^\]]*)\]\(\s*<?https?:\/\/[^)\s>]+>?\s*\)/gi,
        ""
    );

    const pattern = /https?:\/\/[^\s<>"'()[\]]+/gi;

    for (const match of withoutMarkdown.matchAll(pattern)) {
        addUrl(match[0], urls);
    }
}

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

function extractMessageTitle(components) {
    for (const component of components ?? []) {
        if (!component) continue;

        if (typeof component.content === "string") {
            const match = component.content.match(
                /^##\s+\[([^\]]+)\]\((https?:\/\/[^)]+)\)/m
            );

            if (match) {
                const title = cleanTitle(match[1]);

                if (title) return title;
            }
        }

        const nestedTitle = extractMessageTitle(
            component.components
        );

        if (nestedTitle) return nestedTitle;

        if (component.accessory) {
            const accessoryTitle = extractMessageTitle([
                component.accessory
            ]);

            if (accessoryTitle) return accessoryTitle;
        }
    }

    return null;
}

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
            // 無効なJSON-LDは無視
        }
    });

    return result;
}

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

function cleanNewsGgTitle(title) {
    return cleanTitle(title)
        ?.replace(/\s*\|\s*News\.gg\s*$/i, "")
        ?.replace(/\s*-\s*News\.gg\s*$/i, "")
        ?.replace(/\s*\|\s*Reuters\s*$/i, "")
        ?.trim() || null;
}

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
            // 無効なURLは無視
        }
    });

    console.log("[News.gg] Source link candidates:", candidates);

    const directLink = candidates.find(
        item => !isNewsGgUrl(item.url)
    );

    if (directLink) {
        console.log(
            "[News.gg] Source URL found:",
            directLink.url
        );

        return directLink.url;
    }

    console.log("[News.gg] Source URL not found.");
    return null;
}

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
            "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
        },
        redirect: "follow"
    });

    if (!response.ok) {
        throw new Error(
            `News.gg HTTP ${response.status}: ${response.url}`
        );
    }

    if (!isNewsGgUrl(response.url)) {
        throw new Error(
            `Unexpected redirect destination: ${response.url}`
        );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const messageTitle = extractMessageTitle(
        message.components
    );

    const newsGgTitle = cleanNewsGgTitle(extractTitle($));

    const componentTexts = extractComponentTexts(
        message.components
    );

    const componentTitle = componentTexts.find(text =>
        text.length >= 15 &&
        !/read full article|original article|full story|invite|join server/i.test(text)
    );

    const title =
        messageTitle ||
        newsGgTitle ||
        cleanTitle(componentTitle) ||
        "News.gg News";

    const sourceUrl =
        extractSourceUrl($, response.url) ||
        response.url;

    return {
        title,
        sourceUrl
    };
}

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
            article = await extractArticle(
                articlePageUrl,
                message
            );
        } catch (error) {
            console.error(
                "[News.gg] Article extraction failed:",
                error.message
            );

            article = {
                title:
                    extractMessageTitle(message.components) ||
                    "News.gg News",
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
