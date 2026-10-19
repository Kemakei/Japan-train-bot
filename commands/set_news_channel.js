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
    .setDescription("このチャンネルをNews.ggニュースの監視対象に設定する")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild);

export async function execute(interaction, { client }) {
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
            content: "News.gg Botがこのサーバーに参加していません。",
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
            content: `このチャンネル（${interaction.channel}）をNews.ggニュースの監視対象に設定しました。`,
            ephemeral: true
        });
    } catch (error) {
        console.error("News.ggチャンネル設定エラー:", error);

        await interaction.reply({
            content: "チャンネル設定中にエラーが発生しました。",
            ephemeral: true
        });
    }
}

function extractUrls(message) {
    const urls = new Set();
    const pattern = /https?:\/\/[^\s<>]+/g;

    function addUrls(text) {
        if (!text) return;

        const matches = text.match(pattern) || [];

        for (let url of matches) {
            url = url.replace(/[.,!?;:)]+$/g, "");
            urls.add(url);
        }
    }

    addUrls(message.content);

    for (const embed of message.embeds) {
        addUrls(embed.url);
        addUrls(embed.description);

        for (const field of embed.fields || []) {
            addUrls(field.name);
            addUrls(field.value);
        }
    }

    return [...urls];
}

async function extractArticle(articlePageUrl) {
    const response = await fetch(articlePageUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; NewsArticleBot/1.0)"
        },
        signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
        throw new Error(`News.ggページ取得失敗: HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title =
        $('meta[property="og:title"]').attr("content")?.trim() ||
        $("h1").first().text().trim() ||
        $("title").first().text().trim();

    let sourceUrl = null;

    $('a[href]').each((_, element) => {
        const text = $(element).text().replace(/\s+/g, " ").trim();

        if (/read\s+full\s+article/i.test(text)) {
            const href = $(element).attr("href");

            if (!href) return;

            try {
                const url = new URL(href, articlePageUrl);

                if (url.protocol === "https:" || url.protocol === "http:") {
                    sourceUrl = url.href;
                    return false;
                }
            } catch {
                // 無効なURLは無視
            }
        }
    });

    if (!title || !sourceUrl) {
        return null;
    }

    return { title, sourceUrl };
}

export async function handleMessage(message, client) {
    if (!message.guild || message.author.id !== NEWS_GG_BOT_ID) {
        return;
    }

    const settings = await client.db
        .collection(SETTINGS_COLLECTION)
        .findOne({ guildId: message.guild.id });

    if (!settings || settings.channelId !== message.channel.id) {
        return;
    }

    const urls = extractUrls(message);

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
        console.error("News.gg記事の取得エラー:", error);
        return;
    }

    if (!article) {
        console.error("記事タイトルまたは元記事URLを取得できませんでした。");
        return;
    }

    try {
        await message.delete();
    } catch (error) {
        console.error("News.gg元メッセージの削除に失敗:", error);
        return;
    }

    try {
        await message.channel.send({
            content: `**${article.title}**\n${article.sourceUrl}`,
            allowedMentions: { parse: [] }
        });
    } catch (error) {
        console.error("ニュースの再投稿に失敗:", error);
    }
}
