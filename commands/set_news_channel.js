
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    InteractionContextType
} from "discord.js";
import * as cheerio from "cheerio";

const NEWS_GG_BOT_ID = process.env.NEWS_GG_BOT_ID;
const TEST_USER_ID = "1263016864477351936";
const ALLOWED_NEWS_SENDERS = new Set([
    NEWS_GG_BOT_ID,
    TEST_USER_ID
].filter(Boolean));
const SETTINGS_COLLECTION = "newsChannelSettings";

export const data = new SlashCommandBuilder()
    .setName("set_news_channel")
    .setDescription("このチャンネルをNews.ggニュースの監視対象に設定する")
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
            content: "環境変数 NEWS_GG_BOT_ID が設定されていません。",
            ephemeral: true
        });
        return;
    }

    try {
        await interaction.guild.members.fetch(NEWS_GG_BOT_ID);
    } catch {
        await interaction.reply({
            content: "エラー：News.gg Bot がこのサーバーに参加していません。",
            ephemeral: true
        });
        return;
    }

    try {
        await client.db.collection(SETTINGS_COLLECTION).updateOne(
            { guildId: interaction.guild.id },
            {
                $set: {
                    channelId: interaction.channel.id,
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );

        await interaction.reply({
            content: `監視チャンネルを ${interaction.channel} に設定しました。`,
            ephemeral: true
        });
    } catch (error) {
        console.error("News channel configuration error:", error);

        await interaction.reply({
            content: "監視チャンネルの設定に失敗しました。",
            ephemeral: true
        });
    }
}

function extractUrls(message) {
    const urls = new Set();
    const pattern = /https?:\/\/[^\s<>]+/g;

    for (const match of message.content.matchAll(pattern)) {
        urls.add(match[0].replace(/[),.!?]+$/, ""));
    }

    for (const embed of message.embeds) {
        if (embed.url) {
            urls.add(embed.url);
        }

        const description = embed.description ?? "";

        for (const match of description.matchAll(pattern)) {
            urls.add(match[0].replace(/[),.!?]+$/, ""));
        }

        for (const field of embed.fields ?? []) {
            for (const match of field.value.matchAll(pattern)) {
                urls.add(match[0].replace(/[),.!?]+$/, ""));
            }
        }
    }

    return [...urls];
}

async function extractArticle(articlePageUrl) {
    const response = await fetch(articlePageUrl, {
        signal: AbortSignal.timeout(15000),
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; NewsArticleBot/1.0)"
        }
    });

    if (!response.ok) {
        throw new Error(`記事ページ取得失敗: HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title = (
        $('meta[property="og:title"]').attr("content") ||
        $("h1").first().text() ||
        $("title").text()
    ).trim();

    let sourceUrl = null;

    $("a[href]").each((_, element) => {
        if (sourceUrl) return;

        const linkText = $(element).text().replace(/\s+/g, " ").trim();

        if (!/read\s+full\s+article/i.test(linkText)) return;

        const href = $(element).attr("href");
        if (!href) return;

        try {
            const parsedUrl = new URL(href, articlePageUrl);

            if (["http:", "https:"].includes(parsedUrl.protocol)) {
                sourceUrl = parsedUrl.href;
            }
        } catch {
            // 不正なリンクは無視する
        }
    });

    if (!title || !sourceUrl) {
        return null;
    }

    return { title, sourceUrl };
}

export async function handleMessage(message, client) {
    if (!message.guild || !ALLOWED_NEWS_SENDERS.has(message.author.id)) {
        return;
    }

    const settings = await client.db
        .collection(SETTINGS_COLLECTION)
        .findOne({ guildId: message.guild.id });

    if (!settings || settings.channelId !== message.channel.id) {
        return;
    }

    const urls = extractUrls(message);

    // News.ggの記事ページURLを優先する
    const articlePageUrl = urls.find(url => {
        try {
            return new URL(url).hostname === "newsdiscordbot.xyz";
        } catch {
            return false;
        }
    });

    if (!articlePageUrl) return;

    let article;

    try {
        article = await extractArticle(articlePageUrl);
    } catch (error) {
        console.error("News article extraction error:", error);
        return;
    }

    if (!article) {
        console.error("記事タイトルまたは元記事URLを取得できませんでした。");
        return;
    }

    try {
        await message.delete();
    } catch (error) {
        console.error("News message deletion error:", error);
        return;
    }

    try {
        await message.channel.send({
            content: `**${article.title}**\n${article.sourceUrl}`,
            allowedMentions: { parse: [] }
        });
    } catch (error) {
        console.error("News article posting error:", error);
    }
}
