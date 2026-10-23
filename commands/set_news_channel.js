
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
            extractComponentTexts(
                [component.accessory],
                texts
            );
        }

        if (component.components) {
            extractComponentTexts(
                component.components,
                texts
            );
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
 * ページ取得。タイムアウトなどは最大3回試行
 */
async function fetchPage(url, retries = 2) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(25000),
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
                const error = new Error(
                    `HTTP ${response.status}: ${response.url}`
                );

                if (
                    response.status === 403 ||
                    response.status === 404 ||
                    response.status === 410
                ) {
                    error.noRetry = true;
                }

                throw error;
            }

            return {
                html: await response.text(),
                url: response.url
            };
        } catch (error) {
            lastError = error;

            console.warn(
                `[News.gg] Fetch attempt ${attempt + 1}/${retries + 1} failed:`,
                url,
                error.message
            );

            if (error.noRetry || attempt === retries) break;

            await new Promise(resolve =>
                setTimeout(resolve, 1000 * (attempt + 1))
            );
        }
    }

    throw lastError;
}

/**
 * News.gg内部URLか判定
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
 * Google News URLか判定
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
 * Reuters URLか判定
 */
function isReutersUrl(url) {
    try {
        const hostname = new URL(url).hostname.toLowerCase();

        return (
            hostname === "reuters.com" ||
            hostname.endsWith(".reuters.com")
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

    if (!title) return null;

    return title;
}

/**
 * JSON-LDから記事タイトルを抽出
 */
function extractJsonLdTitle($) {
    let result = null;

    $('script[type="application/ld+json"]').each((_, element) => {
        if (result) return;

        const raw = $(element).contents().text();

        if (!raw) return;

        try {
            const data = JSON.parse(raw);
            const objects = Array.isArray(data)
                ? data
                : [data];

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

                if (object?.["@graph"]) {
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
 * ページ内のメタデータからタイトルを抽出
 */
function extractTitle($) {
    const candidates = [
        $('meta[property="og:title"]').attr("content"),
        $('meta[name="twitter:title"]').attr("content"),
        $('meta[name="title"]').attr("content"),
        $('meta[property="parsely-title"]').attr("content"),
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
 * News.ggのタイトルからサイト名を除去
 */
function cleanNewsGgTitle(title) {
    return cleanTitle(title)
        ?.replace(/\s*\|\s*News\.gg\s*$/i, "")
        ?.replace(/\s*-\s*News\.gg\s*$/i, "")
        ?.replace(/\s*\|\s*Reuters\s*$/i, "")
        ?.trim() || null;
}

/**
 * News.ggページのリンクから元記事を探す
 */
function extractSourceCandidates($, pageUrl) {
    const candidates = [];

    $("a[href]").each((_, element) => {
        const href = $(element).attr("href");

        if (!href) return;

        const text = $(element)
            .text()
            .replace(/\s+/g, " ")
            .trim();

        try {
            const url = new URL(href, pageUrl);

            if (
                !["http:", "https:"].includes(url.protocol) ||
                isNewsGgUrl(url.href)
            ) {
                return;
            }

            candidates.push({
                text,
                url: url.href
            });
        } catch {
            // 不正なURLは無視
        }
    });

    return candidates;
}

/**
 * 元記事リンクを選択
 */
function extractSourceUrl($, pageUrl) {
    const candidates = extractSourceCandidates($, pageUrl);

    const exact = candidates.find(item =>
        /read\s+full\s+article/i.test(item.text)
    );

    if (exact) {
        console.log(
            "[News.gg] Source link found:",
            exact
        );

        return exact.url;
    }

    const alternate = candidates.find(item =>
        /original\s+article|full\s+story|read\s+more|元記事|記事を読む|全文を読む|続きを読む/i.test(
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

    // リンクテキストに依存せず、Reutersなどの外部ニュースURLも調べる
    const knownPublishers = candidates.find(item =>
        isReutersUrl(item.url) ||
        /bbc\.co\.uk|bbc\.com|apnews\.com|nytimes\.com|theguardian\.com|cnn\.com/i.test(
            new URL(item.url).hostname
        )
    );

    if (knownPublishers) {
        console.log(
            "[News.gg] Publisher domain candidate found:",
            knownPublishers
        );

        return knownPublishers.url;
    }

    console.warn(
        "[News.gg] Source link not found. Candidates:",
        candidates
    );

    return null;
}

/**
 * Google News記事URLから出版社URLを探す
 */
async function resolveGoogleNewsUrl(googleUrl) {
    if (!isGoogleNewsUrl(googleUrl)) return googleUrl;

    console.log(
        "[News.gg] Resolving Google News URL:",
        googleUrl
    );

    try {
        const page = await fetchPage(googleUrl);
        const finalUrl = page.url;

        if (
            !isGoogleNewsUrl(finalUrl) &&
            !isNewsGgUrl(finalUrl)
        ) {
            return finalUrl;
        }

        const $ = cheerio.load(page.html);

        // Google Newsの記事要素に含まれる署名情報
        const articleElement = $("[data-n-a-id]").first();

        const articleId = articleElement.attr("data-n-a-id");
        const timestamp = articleElement.attr("data-n-a-ts");
        const signature = articleElement.attr("data-n-a-sg");

        if (articleId && timestamp && signature) {
            const inner = JSON.stringify([
                "garturlreq",
                [
                    [
                        "X", "X", ["X", "X"],
                        null, null, 1, 1, "US:en",
                        null, 1, null, null, null, null,
                        null, 0, 1
                    ],
                    "X", "X", 1, [1, 1, 1], 1, 1,
                    null, 0, 0, null, 0
                ],
                articleId,
                Number(timestamp),
                signature
            ]);

            const form = new URLSearchParams({
                "f.req": JSON.stringify([
                    [[
                        "Fbv4je",
                        inner,
                        null,
                        "generic"
                    ]]
                ])
            });

            const response = await fetch(
                "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je",
                {
                    method: "POST",
                    signal: AbortSignal.timeout(20000),
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                            "AppleWebKit/537.36 (KHTML, like Gecko) " +
                            "Chrome/131.0.0.0 Safari/537.36",
                        "Content-Type":
                            "application/x-www-form-urlencoded;charset=UTF-8",
                        "Referer": googleUrl,
                        "Origin": "https://news.google.com"
                    },
                    body: form.toString()
                }
            );

            if (response.ok) {
                const raw = await response.text();

                // Googleの応答は複数行になることがある
                for (const line of raw.split("\n")) {
                    const trimmed = line.trim();

                    if (!trimmed.startsWith("[")) continue;

                    try {
                        const root = JSON.parse(trimmed);
                        const queue = [root];

                        while (queue.length) {
                            const item = queue.pop();

                            if (typeof item === "string") {
                                if (
                                    item.startsWith("[") ||
                                    item.startsWith("{")
                                ) {
                                    try {
                                        queue.push(JSON.parse(item));
                                    } catch {
                                        // 文字列は無視
                                    }
                                }

                                // 応答内のURL文字列も検出
                                const match = item.match(
                                    /https?:\/\/(?:www\.)?reuters\.com\/[^\s"'\\]+/i
                                );

                                if (match) {
                                    return match[0];
                                }

                                continue;
                            }

                            if (!Array.isArray(item)) continue;

                            if (
                                item[0] === "wrb.fr" &&
                                item[1] === "Fbv4je" &&
                                typeof item[2] === "string"
                            ) {
                                try {
                                    const result = JSON.parse(item[2]);
                                    const queue2 = [result];

                                    while (queue2.length) {
                                        const nested = queue2.pop();

                                        if (typeof nested === "string") {
                                            if (
                                                /^https?:\/\//i.test(nested) &&
                                                !isGoogleNewsUrl(nested) &&
                                                !isNewsGgUrl(nested)
                                            ) {
                                                return nested;
                                            }

                                            try {
                                                queue2.push(JSON.parse(nested));
                                            } catch {
                                                // 通常の文字列
                                            }

                                            continue;
                                        }

                                        if (Array.isArray(nested)) {
                                            queue2.push(...nested);
                                        }
                                    }
                                } catch {
                                    // 応答形式が異なる場合は続行
                                }
                            }

                            queue.push(...item);
                        }
                    } catch {
                        // JSONでない行は無視
                    }
                }
            }
        }

        // フォールバック: Google News HTMLの外部リンクを探す
        const external = new Set();

        $("a[href], [data-n-au], [data-url]").each((_, element) => {
            const values = [
                $(element).attr("href"),
                $(element).attr("data-n-au"),
                $(element).attr("data-url")
            ];

            for (const value of values) {
                if (!value) continue;

                try {
                    const url = new URL(value, page.url);

                    if (
                        ["http:", "https:"].includes(url.protocol) &&
                        !isGoogleNewsUrl(url.href) &&
                        !isNewsGgUrl(url.href)
                    ) {
                        external.add(url.href);
                    }
                } catch {
                    // 不正なURLは無視
                }
            }
        });

        const urls = [...external];

        // Reutersを最優先
        const reuters = urls.find(isReutersUrl);

        if (reuters) {
            console.log(
                "[News.gg] Reuters URL resolved:",
                reuters
            );

            return reuters;
        }

        if (urls.length > 0) {
            return urls[0];
        }
    } catch (error) {
        console.warn(
            "[News.gg] Google News resolution failed:",
            error.message
        );
    }

    return null;
}

/**
 * 元記事URLからタイトルを取得
 */
async function fetchSourceTitle(sourceUrl) {
    try {
        console.log(
            "[News.gg] Fetching source page:",
            sourceUrl
        );

        const page = await fetchPage(sourceUrl);
        const $ = cheerio.load(page.html);
        const title = extractTitle($);

        return {
            title,
            url: page.url
        };
    } catch (error) {
        console.warn(
            "[News.gg] Source title fetch failed:",
            sourceUrl,
            error.message
        );

        return {
            title: null,
            url: sourceUrl
        };
    }
}

/**
 * News.ggページから記事情報を取得
 */
async function extractArticle(articlePageUrl, message) {
    console.log(
        "[News.gg] Fetching article page:",
        articlePageUrl
    );

    const page = await fetchPage(articlePageUrl);
    const $ = cheerio.load(page.html);

    // News.ggのタイトルを先に確保
    const newsGgTitle = cleanNewsGgTitle(
        extractTitle($)
    );

    const componentTexts = extractComponentTexts(
        message.components
    );

    const componentTitle = componentTexts.find(text =>
        text.length >= 15 &&
        !/read full article|original article|invite|join server/i.test(text)
    );

    const fallbackTitle =
        newsGgTitle ||
        cleanTitle(componentTitle);

    console.log("[News.gg] Title candidates:", {
        newsGgTitle,
        componentTitle
    });

    let sourceUrl = extractSourceUrl($, page.url);

    if (!sourceUrl) {
        console.warn(
            "[News.gg] No publisher link found in article HTML."
        );

        console.warn("[News.gg] Link diagnostics:", {
            canonical: $('link[rel="canonical"]').attr("href"),
            ogUrl: $('meta[property="og:url"]').attr("content"),
            links: extractSourceCandidates($, page.url)
        });

        return fallbackTitle
            ? {
                title: fallbackTitle,
                sourceUrl: page.url
            }
            : null;
    }

    // Google News経由なら元の出版社URLを解決
    if (isGoogleNewsUrl(sourceUrl)) {
        const resolvedUrl = await resolveGoogleNewsUrl(sourceUrl);

        if (resolvedUrl) {
            sourceUrl = resolvedUrl;
        } else {
            console.warn(
                "[News.gg] Google News destination unresolved."
            );

            return fallbackTitle
                ? {
                    title: fallbackTitle,
                    sourceUrl: page.url
                }
                : null;
        }
    }

    // Reutersは403になりやすいので、タイトル取得に失敗してもURLを保持
    const source = await fetchSourceTitle(sourceUrl);

    if (source.title) {
        return {
            title: cleanTitle(source.title),
            sourceUrl: source.url
        };
    }

    if (fallbackTitle) {
        console.warn(
            "[News.gg] Using News.gg title with detected publisher URL:",
            sourceUrl
        );

        return {
            title: fallbackTitle,
            sourceUrl: source.url || sourceUrl
        };
    }

    return {
        title: "News.gg News",
        sourceUrl: page.url
    };
}

/**
 * News.gg投稿を監視
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
            console.warn(
                "[News.gg] News.gg article URL not found."
            );
            return;
        }

        let article = null;

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
        }

        // News.ggページ自体がタイムアウトした場合もフォールバック
        if (!article) {
            const componentTexts = extractComponentTexts(
                message.components
            );

            const title = componentTexts.find(text =>
                text.length >= 15 &&
                !/read full article|original article|invite|join server/i.test(text)
            );

            article = {
                title: cleanTitle(title) || "News.gg News",
                sourceUrl: articlePageUrl
            };

            console.warn(
                "[News.gg] Using final fallback:",
                article
            );
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
