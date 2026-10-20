import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType
} from "discord.js";
import * as cheerio from "cheerio";

const NEWS_GG_BOT_ID = process.env.NEWS_GG_BOT_ID;
const SETTINGS_COLLECTION = "newsChannelSettings";

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

            if (settings.length === 0) {
                await interaction.reply({
                    content: "このチャンネルのNews.gg監視を解除しました。現在、監視中のチャンネルはありません。",
                    ephemeral: true
                });
            } else {
                const channelMentions = settings.map(
                    setting => `<#${setting.channelId}>`
                );

                await interaction.reply({
                    content:
                        `このチャンネルのNews.gg監視を解除しました。\n` +
                        `監視チャンネルを ${channelMentions.join(" ")} に設定しました。`,
                    ephemeral: true
                });
            }

            return;
        }

        if (!NEWS_GG_BOT_ID) {
            await interaction.reply({
                content: "NEWS_GG_BOT_ID が設定されていません。.envを確認してください。",
                ephemeral: true
            });
            return;
        }

        try {
            await interaction.guild.members.fetch(NEWS_GG_BOT_ID);
        } catch {
            await interaction.reply({
                content: "News.ggがサーバーに参加していません。",
                ephemeral: true
            });
            return;
        }

        await collection.updateOne(
            { guildId, channelId },
            {
                $setOnInsert: {
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
        console.error("News.gg channel settings error:", error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "News.gg監視設定の更新に失敗しました。データベースを確認してください。",
                ephemeral: true
            });
        }
    }
}

function extractUrls(message) {
    const urls = new Set();
    const pattern = /https?:\/\/[^\s<>"']+/gi;

    const addUrls = value => {
        if (typeof value !== "string" || !value) return;

        for (const match of value.matchAll(pattern)) {
            const cleanedUrl = match[0].replace(/[),.!?;:}\]]+$/, "");

            try {
                const parsedUrl = new URL(cleanedUrl);

                if (["http:", "https:"].includes(parsedUrl.protocol)) {
                    urls.add(parsedUrl.href);
                }
            } catch {
                // 不正なURLは無視
            }
        }
    };

    addUrls(message.content);

    for (const embed of message.embeds ?? []) {
        addUrls(embed.url);
        addUrls(embed.title);
        addUrls(embed.description);

        addUrls(embed.author?.name);
        addUrls(embed.author?.url);
        addUrls(embed.author?.iconURL);

        addUrls(embed.footer?.text);
        addUrls(embed.footer?.iconURL);

        addUrls(embed.thumbnail?.url);
        addUrls(embed.image?.url);
        addUrls(embed.video?.url);

        addUrls(embed.provider?.name);
        addUrls(embed.provider?.url);

        for (const field of embed.fields ?? []) {
            addUrls(field.name);
            addUrls(field.value);
        }
    }

    return [...urls];
}

async function fetchPage(url) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; NewsArticleBot/1.0)"
        },
        redirect: "follow"
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return {
        html: await response.text(),
        url: response.url
    };
}

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
        const title = candidate?.replace(/\s+/g, " ").trim();

        if (title) {
            return title;
        }
    }

    return null;
}

async function extractArticle(articlePageUrl) {
    const articlePage = await fetchPage(articlePageUrl);
    const $ = cheerio.load(articlePage.html);

    let sourceUrl = null;

    $("a[href]").each((_, element) => {
        if (sourceUrl) return;

        const linkText = $(element)
            .text()
            .replace(/\s+/g, " ")
            .trim();

        if (!/read\s+full\s+article/i.test(linkText)) return;

        const href = $(element).attr("href");

        if (!href) return;

        try {
            const parsedUrl = new URL(href, articlePage.url);

            if (
                ["http:", "https:"].includes(parsedUrl.protocol) &&
                parsedUrl.hostname.toLowerCase() !== "newsdiscordbot.xyz"
            ) {
                sourceUrl = parsedUrl.href;
            }
        } catch {
            // 不正なURLは無視
        }
    });

    if (!sourceUrl) return null;

    const sourcePage = await fetchPage(sourceUrl);
    const sourcePage$ = cheerio.load(sourcePage.html);
    const title = extractTitle(sourcePage$);

    if (!title) return null;

    return {
        title,
        sourceUrl: sourcePage.url
    };
}

export async function handleMessage(message, client) {
    if (
        !message.guild ||
        !NEWS_GG_BOT_ID ||
        message.author.id !== NEWS_GG_BOT_ID
    ) {
        return;
    }

    const settings = await client.db
        .collection(SETTINGS_COLLECTION)
        .findOne({
            guildId: message.guild.id,
            channelId: message.channel.id
        });

    if (!settings) return;

    const urls = extractUrls(message);

    const articlePageUrl = urls.find(url => {
        try {
            return new URL(url).hostname.toLowerCase() === "newsdiscordbot.xyz";
        } catch {
            return false;
        }
    });

    if (!articlePageUrl) return;

    let article;

    try {
        article = await extractArticle(articlePageUrl);
    } catch (error) {
        console.error("News.gg article extraction failed:", error);
        return;
    }

    if (!article) return;

    try {
        await message.channel.send({
            content: `**${article.title}**\n${article.sourceUrl}`,
            allowedMentions: { parse: [] }
        });
    } catch (error) {
        console.error("News.gg article posting failed:", error);
        return;
    }

    try {
        await message.delete();
    } catch {
        // メッセージを削除できない場合は何もしない
    }
}
