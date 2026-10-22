
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
 * Markdownリンクと通常のテキストからURLを抽出
 */
function extractUrlsFromText(value, urls) {
    if (typeof value !== "string" || !value) return;

    const markdownPattern =
        /\]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/gi;

    for (const match of value.matchAll(markdownPattern)) {
        addUrl(match[1], urls);
    }

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
 * Components V2からタイトル候補を抽出
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
 * ページ取得失敗時のタイトル候補
 */
function getFallbackTitle(message) {
    const texts = extractComponentTexts(message.components);

    return texts.find(text =>
        text.length >= 15 &&
        !/read full article|original article|invite|join server/i.test(text)
    ) || null;
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
 * Webページを取得
 * タイムアウトや一時的なエラーは再試行する
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

            if (error.noRetry || attempt === retries) {
                break;
            }

            await new Promise(resolve =>
                setTimeout(resolve, 1000 * (attempt + 1))
            );
        }
    }

    throw lastError;
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

        if (title) return title;
    }

    return null;
}

/**
 * News.gg内部のURLか判定
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
 * Google NewsのURLから元記事を探す
 */
async function resolveGoogleNewsUrl(googleUrl) {
    if (!isGoogleNewsUrl(googleUrl)) {
        return googleUrl;
    }

    console.log(
        "[News.gg] Resolving Google News URL:",
        googleUrl
    );

    try {
        const page = await fetchPage(googleUrl);
        const finalUrl = page.url;

        // 通常のHTTPリダイレクトで出版社に到達した場合
        if (
            !isGoogleNewsUrl(finalUrl) &&
            !isNewsGgUrl(finalUrl)
        ) {
            console.log(
                "[News.gg] Google News redirect destination:",
                finalUrl
            );

            return finalUrl;
        }

        const $ = cheerio.load(page.html);
        const externalUrls = new Set();

        // HTML内のリンクを調べる
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

                    for (const key of [
                        "url",
                        "u",
                        "article_url",
                        "target"
                    ]) {
                        const nested = parsed.searchParams.get(key);

                        if (
                            nested &&
                            /^https?:\/\//i.test(nested) &&
                            !isGoogleNewsUrl(nested) &&
                            !isNewsGgUrl(nested)
                        ) {
                            externalUrls.add(nested);
                        }
                    }

                    if (
                        ["http:", "https:"].includes(parsed.protocol) &&
                        !isGoogleNewsUrl(parsed.href) &&
                        !isNewsGgUrl(parsed.href)
                    ) {
                        externalUrls.add(parsed.href);
                    }
                } catch {
                    // 不正なURLは無視
                }
            }
        });

        // よく使われるニュース出版社を優先
        const preferredDomains = [
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

        for (const url of externalUrls) {
            const hostname = new URL(url).hostname.toLowerCase();

            if (
                preferredDomains.some(domain =>
                    hostname === domain ||
                    hostname.endsWith(`.${domain}`)
                )
            ) {
                console.log(
                    "[News.gg] Publisher URL found:",
                    url
                );

                return url;
            }
        }

        const firstExternal = externalUrls.values().next().value;

        if (firstExternal) {
            console.log(
                "[News.gg] External Google News link found:",
                firstExternal
            );

            return firstExternal;
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
 * News.ggページから元記事URLを探す
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

    const preferred = candidates.find(item =>
        /read\s+full\s+article/i.test(item.text)
    );

    if (preferred) {
        console.log(
            "[News.gg] Source article link found:",
            preferred
        );

        return preferred.url;
    }

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
        "[News.gg] Source article link not found:",
        candidates
    );

    return null;
}

/**
 * News.ggページから記事情報を取得
 */
async function extractArticle(articlePageUrl) {
    console.log(
        "[News.gg] Fetching article page:",
        articlePageUrl
    );

    // News.ggページが取得できなければ呼び出し元でフォールバック
    const articlePage = await fetchPage(articlePageUrl);
    const $ = cheerio.load(articlePage.html);

    console.log(
        "[News.gg] News.gg page title:",
        $("title").text()
    );

    const newsGgTitle = extractTitle($)
        ?.replace(/\s*\|\s*News\.gg\s*$/i, "")
        .trim();

    let sourceUrl = extractSourceUrl(
        $,
        articlePage.url
    );

    // 元記事リンクが見つからない場合はページ情報を記録
    if (!sourceUrl) {
        console.warn("[News.gg] Link diagnostics:", {
            canonical: $('link[rel="canonical"]').attr("href"),
            ogUrl: $('meta[property="og:url"]').attr("content"),
            links: $("a[href]")
                .map((_, element) => ({
                    text: $(element).text().trim(),
                    href: $(element).attr("href")
                }))
                .get()
        });

        if (newsGgTitle) {
            return {
                title: newsGgTitle,
                sourceUrl: articlePage.url
            };
        }

        return null;
    }

    // Google Newsのリンクから出版社URLを解決
    if (isGoogleNewsUrl(sourceUrl)) {
        const resolvedUrl = await resolveGoogleNewsUrl(sourceUrl);

        if (resolvedUrl) {
            sourceUrl = resolvedUrl;
        } else {
            console.warn(
                "[News.gg] Publisher URL could not be resolved."
            );

            return newsGgTitle
                ? {
                    title: newsGgTitle,
                    sourceUrl: articlePage.url
                }
                : null;
        }
    }

    // 元記事サイトからタイトルを取得
    try {
        console.log(
            "[News.gg] Fetching source article:",
            sourceUrl
        );

        const sourcePage = await fetchPage(sourceUrl);
        const source$ = cheerio.load(sourcePage.html);
        const sourceTitle = extractTitle(source$);

        if (sourceTitle) {
            return {
                title: sourceTitle,
                sourceUrl: sourcePage.url
            };
        }

        console.warn(
            "[News.gg] Source title not found:",
            sourcePage.url
        );
    } catch (error) {
        console.warn(
            "[News.gg] Source fetch failed; preserving URL:",
            sourceUrl,
            error.message
        );
    }

    // 元記事の取得に失敗しても、分かっている元記事URLを保持
    if (newsGgTitle) {
        return {
            title: newsGgTitle,
            sourceUrl
        };
    }

    return null;
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
        // 監視チャンネルか確認
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

        const urls = extractUrls(message);

        console.log(
            "[News.gg] Extracted URLs:",
            urls
        );

        // News.gg記事URLを特定
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

        let article = null;

        try {
            article = await extractArticle(articlePageUrl);
        } catch (error) {
            console.error(
                "[News.gg] Article extraction failed; using fallback:",
                error.message
            );
        }

        // News.ggページ自体の取得失敗時も投稿を試みる
        if (!article) {
            article = {
                title: getFallbackTitle(message) || "News.gg News",
                sourceUrl: articlePageUrl
            };

            console.warn(
                "[News.gg] Using fallback article:",
                article
            );
        }

        // 投稿する前に空のタイトルとURLを検証
        if (
            typeof article.title !== "string" ||
            !article.title.trim() ||
            typeof article.sourceUrl !== "string" ||
            !/^https?:\/\//i.test(article.sourceUrl)
        ) {
            console.error(
                "[News.gg] Invalid article data:",
                article
            );
            return;
        }

        // 再投稿が成功した場合のみ元メッセージを削除
        const sentMessage = await message.channel.send({
            content: `**${article.title.trim()}**\n${article.sourceUrl}`,
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
