import{
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} from "discord.js";

const pages = [
    {
        title: "目次",
        description: `
        駅系
        経済系
        bot系
        その他
        `,
        color: 0x5865F2
    },
    {
        title: "駅系",
        description: `
        Q./random_specifyで、入力した路線は存在するはずなのに「見つかりませんでした」となります。
        A.こちらが登録している路線名と入力した路線が一致していない可能性があります。\nアルファベットは全て全角で、JRは「JR」とつけずそのままです（例:JR山手線→山手線）。また、愛称ではなく正式名称で登録している場合もあります。それでも見つからない場合は、ジョルダン様やnavitime様に登録されている路線名をお試しください。
        
        Q.表示された駅に乗り入れしているはずの路線が存在しません。
        A.運行系統や正式区間等の食い違いの影響で、正確でない箇所が存在する可能性があります（例:常磐線は、正式には日暮里駅からですが、運行系統の観点から品川駅を起点に登録しています｝。\nまた、駅名が違う場合は、たとえ乗換ができてもそれらは別駅とみなし、乗り入れ路線として扱ってない場合もあります（例:京成上野と上野駅は別駅と扱っているため、上野駅に京成本線等は登録しておりません）。
        
        Q.表示された駅は現在廃駅です。
        A.駅を登録しているのは、2026年6月ごろです。そのため、情報が更新されていない可能性があります。見つけた際には日本の駅bot管理者にDMをお願いします。

        Q.登録された駅・路線は誤字、脱字または衍字を含んでいます。
        A.入力は全て手作業でやっているため、それらを含んでいる可能性があります。見つけた際には日本の駅bot管理者にDMをお願いいたします。
        `,
        color: 0x5865F2
    },
    {
        title: "経済系",
        description: `
        Q.お金はどうやって増やすの？
        A.まずは/workを行うことで自身の資金を得ることができます。その後、/jobで職業を変更し、１回あたりの給料を増やすこともできます。\n一部転職にはお金またはライセンス（/licenseより取得可能）が必要です。\nその後は、ギャンブルや株、宝くじなどでお金を増やすことが可能です。
        
        Q.株価はどうやってやるの？
        A.株はいくつか会社が存在し、/stock_graphで全会社の現在の株情報が確認可能です。\nまた、/stock_buyまたはstock_sellで株の売り買いが可能です。取引には手数料がかかります。\n株は30分に一回更新されます。

        Q.宝くじはどうやってやるの？
        A./takarakuji_buyで自分の好きな数字とアルファベットを入力し、購入することが可能です。一口1000コインからとなっています。\nまた、/takarakuji_randomを実行すると、ランダムで数字とアルファベットが指定され、宝くじを指定枚数個買うことができます。\n宝くじは30分に一回更新され、00分または30分になったのち/takarakuji_getを実行することで当選していた場合賞金を獲得することができます。\n当選番号等は/takarakujiで確認可能です。
        
        Q./pokerの結果やゲーム進行に不備があります。
        A.開発者もこのことについて十分承知しています。しかし、もしバグを見つけた際には、報告してもらえるとその対処に励むことができますのでよろしくお願いします。

        Q.hedgeって何？
        A.保険のことです。これを実行すると、選択した金額分毎日自分の口座から保険に払うことになりますが、その分引出する際にはその額+利子をもらうことができます。\n/hedge_contractで契約、hedge_recieveで引出することができます。

        Q.お金がない
        A./leverageでお金を（利子付きで）借りることができます。一週間以内に払えないと、強制的に自分の口座から引き落としになり、最悪株や保険を失うことになるので気を付けてください。\n/leverage borrowで借り入れ、/leverage repayで返済することができます。

        Q.金コインって何？
        A.お金がインフレしたときの対処法です。１兆コインで１金コインです。なお遊べるのはポーカーとスロットのみです。/convertでコインまたは金コインにに変換することができます。

        Q.ギャンブルって何がある？
        A./dice,/slot,/poker,/treasure,/guessがあります。金コインは、/slot_vip,/poker_vipが存在します。

        Q.自身の所持金を確認するには？
        A./moneyで確認できます。
        `,
        color: 0x5865F2
    },
    {
        title: "bot系",
        description: `
        Q.アプリケーションエラーが発生しました。と表示されて使えない
        A.botが一時的に落ちている可能性があります。時間をおいて再度やり直してみてください。長期間続く場合は、日本の駅bot管理者にお問い合わせください。

        Q.エラーが出た
        A.エラーの内容はメッセージに表示されていると思います。サーバー側のエラーが発生した際には、時間をおいて再度やり直してみてください。それでも治らない場合は、日本の駅bot管理者にお問い合わせください。

        Q.コマンドがDMや導入していないサーバーなどで使えない
        A.一部のコマンドはこのbotを導入していないサーバーでも使用できますが、サーバーの存在を前提としているコマンドも存在します（例:メッセージを固定）。
        `,
        color: 0x5865F2
    },
    {
        title: "その他",
        description: `
        Q./takasumi_advanceとは？
        A.takasumi botとの連携コマンドを表示させるコマンドです。これを実行すると、takasumi botのAPIを使用した便利コマンドを使用することができます。\nまた、これはtakasumi bot v3でのみ使用することができます。

        Q.takasumi botとの関係性は？
        A.このbotは開発者がtakasumi botを参考に作りだしたbotのため、一部のコマンドが似ている場合があります。また、takasumi botとの一部連携コマンドなどを搭載しております。

        Q.バグを発見した
        A.お手数をおかけしますが、日本の駅bot開発者に、何をするときに、どのようなバグが発生したのかを教えてもらえると幸いです。

        Q.このbotのコードソースは？
        A.GithubにてJapan_train_botというレポジトリを公開しております。\nまた、実はこのコードはほぼすべてAIによって作られています。よって、コードが最適化されていない部分もあり可能性がありますが、ご了承ください。

        その他ご質問がありましたら、日本の駅bot開発者にどうぞご自由にお申しつけください。
        `,
        color: 0x5865F2
    }
];

export const data = new SlashCommandBuilder()
    .setName("faq")
    .setDescription("FAQを表示します。");

export async function execute(interaction) {
        let page = 0;

        const createEmbed = () => {
            return new EmbedBuilder()
                .setTitle(pages[page].title)
                .setDescription(pages[page].description)
                .setColor(pages[page].color)
                .setFooter({
                    text: `${page + 1} / ${pages.length}`
                });
        };

        const createButtons = () => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("prev")
                    .setLabel("◀ 前へ")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),

                new ButtonBuilder()
                    .setCustomId("next")
                    .setLabel("次へ ▶")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === pages.length - 1)
            );
        };

        const message = await interaction.reply({
            embeds: [createEmbed()],
            components: [createButtons()],
            fetchReply: true
        });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5分
        });

        collector.on("collect", async i => {

            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: "このボタンはコマンドを実行した人のみ使用できます。",
                    ephemeral: true
                });
            }

            if (i.customId === "prev") page--;
            if (i.customId === "next") page++;

            await i.update({
                embeds: [createEmbed()],
                components: [createButtons()]
            });

        });

        collector.on("end", async () => {

            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("prev")
                    .setLabel("◀ 前へ")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),

                new ButtonBuilder()
                    .setCustomId("next")
                    .setLabel("次へ ▶")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true)
            );

            await interaction.editReply({
                components: [disabledRow]
            }).catch(() => {});
        });

};