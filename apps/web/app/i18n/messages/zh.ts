import type { MessageKey } from "./en";

/**
 * Simplified Chinese interface copy (design D4).
 *
 * Typed as `Record<MessageKey, string>`: a key missing here, or one that `en.ts` no longer
 * has, fails the type check. Brand names — bcailab, English Studio, Mapdown, Posts, VanMemo,
 * Google, DeepL — and CEFR bands stay as written.
 */
export const zh: Record<MessageKey, string> = {
  // --- shared ---
  "common.signIn": "登录",
  "common.signInFree": "免费登录",
  "common.signedIn": "已登录",
  "common.profile": "个人资料",
  "common.settings": "设置",
  "common.theme": "主题",
  "common.logOut": "退出登录",
  "common.home": "首页",
  "common.account": "账号",
  "common.user": "用户",
  "common.openUserMenu": "打开用户菜单",
  "common.userMenu": "用户菜单",
  "common.unknownAction": "未知操作。",
  "common.practice": "练习",
  "common.tools": "工具",
  "common.progress": "进度",
  "theme.auto": "自动",
  "theme.light": "浅色",
  "theme.dark": "深色",

  // --- language switcher ---
  "locale.formLabel": "界面语言",
  "locale.switchTo": "把界面切换为 {language}",

  // --- document / meta ---
  "meta.root.description": "个人工具实验室",
  "meta.english.description":
    "专注练英语的一站式工作台：读、写、听、说、译，每一步都有 AI 反馈。",
  "meta.dictation.title": "听写 · bcailab",
  "meta.dictation.description":
    "逐句听，把听到的内容打出来。即时评分，A2 到 C1 分级文章。免费试用，无需账号。",
  "meta.dictationPassage.title": "{title} · 听写 · bcailab",
  "meta.login.title": "登录 · bcailab",

  // --- breadcrumbs (site header) ---
  "breadcrumb.english": "英语",

  // --- footer ---
  "footer.location": "© {year} bcailab · 加拿大不列颠哥伦比亚省本拿比",
  "footer.about": "关于",

  // --- error boundary ---
  "error.status": "出错了",
  "error.title": "页面出了点问题",
  "error.detail": "一个意外错误打断了这个页面。重试通常就能恢复。",
  "error.notFoundTitle": "页面不存在",
  "error.notFoundDetail": "链接可能已经过期，或者它指向的内容已被删除。",
  "error.serverDetail": "服务器没能完成这个请求。",
  "error.goStudio": "前往 English Studio",

  // --- English Studio modules (registry copy) ---
  "module.dictation.label": "听写",
  "module.dictation.description": "逐句听，把听到的内容打出来。",
  "module.dictation.detail":
    "A2 到 C1 分级文章，每句都有单独音频，可以无限重听、切换语速。每一句都会立即和原文对照评分。无需账号即可试用。",
  "module.reading.label": "朗读",
  "module.reading.description": "朗读或背诵文章，每次都有 AI 评估。",
  "module.reading.detail":
    "保存文章、录下每一次尝试，获得关于发音、流利度和完整度的结构化反馈，还能在进度面板里对比每一次。",
  "module.writing.label": "写作",
  "module.writing.description": "写初稿、拿到结构化反馈、修改，并记录每一轮。",
  "module.writing.detail":
    "选一种教练风格，提交初稿，在一轮轮修改中获得打分反馈，教练记得你上次停在哪里。",
  "module.translate.label": "翻译",
  "module.translate.description": "类似 DeepL 的翻译，支持中文、英文及更多语言。",
  "module.translate.detail":
    "由大模型驱动的双栏翻译：自动识别源语言，保留原有格式，一键切换翻译方向。无需账号即可试用。",
  "module.speech.label": "语音",
  "module.speech.description": "把任何文字变成自然的语音，随时随地重放。",
  "module.speech.detail":
    "用自然的声音生成 MP3 音频，保留私人历史记录，用作听力或跟读材料。",
  "module.dictionary.label": "AI 词典",
  "module.dictionary.description": "讲解单词和短语，支持中英双语。",
  "module.dictionary.detail": "规划中：结合语境讲解，并关联到你的朗读和写作练习。",
  "moduleTag.listening": "听力",
  "moduleTag.scoring": "评分",
  "moduleTag.freeToTry": "免费试用",
  "moduleTag.speaking": "口语",
  "moduleTag.evaluation": "评估",
  "moduleTag.writing": "写作",
  "moduleTag.feedback": "反馈",
  "moduleTag.translation": "翻译",
  "moduleTag.llm": "大模型",
  "moduleTag.tts": "语音合成",
  "moduleTag.vocabulary": "词汇",
  "moduleAccess.public": "无需账号",
  "moduleAccess.trial": "免费试用",
  "moduleAccess.auth": "需要账号",

  // --- homepage ---
  "home.eyebrow": "English Studio · bcailab 出品",
  "home.titleLead": "刻意练习英语，",
  "home.titleEmphasis": "每次专注一段。",
  "home.desc":
    "逐句听写；朗读或背诵文章，清楚知道哪里要改；跟写作教练一起修改作文；生成音频用来跟读；不离开页面就能翻译。一个账号，所有练习的进度互通。",
  "home.openStudio": "进入 English Studio",
  "home.tryTranslate": "免登录试用翻译",
  "home.seeInside": "看看里面有什么",
  "home.access": "翻译和听写对所有人开放。朗读和写作可以先免费试用，再决定是否登录。",
  "home.loginHint": "请先登录再使用这些工具。",
  "home.inside": "English Studio 里有什么",
  "home.planned": "规划中",
  "home.notBuilt": "尚未上线",
  "home.otherProjects": "其他项目",
  "home.project.mapdown.note": "无需账号",
  "home.project.mapdown.description":
    "用键盘操作的 Markdown 思维导图编辑器。回车添加同级节点，Tab 添加子节点，导图保存在你的浏览器里，所以离线也能用，第一次打开就能用。",
  "home.project.posts.note": "需要账号",
  "home.project.posts.description":
    "安静的发布工具。用 Markdown 写作，一步发布，分享一个干净的公开链接。",
  "home.project.vanmemo.note": "独立网站",
  "home.project.vanmemo.description":
    "安放零散想法的地方。记录时不用选文件夹、不用起标题，之后按标签、搜索或置顶随时找回。",
  "home.lab": "实验室",
  "home.labBody":
    "bcailab 由 {name} 在加拿大不列颠哥伦比亚省本拿比独立开发和运营。实验室刻意保持小规模，好让已经上线的工具保持锋利：一次只认真做好一个有用的产品。",
  "home.aboutLab": "关于实验室 →",
  "home.followX": "在 X 上关注 →",

  // --- /english landing ---
  "english.eyebrow": "bcailab 出品",
  "english.tagline": "专注练英语的一站式工作台：读、写、听、说、译，每一步都有 AI 反馈。",
  "english.desc":
    "English Studio 把实验室的语言工具集中在一个地方，让你在真实的流程里练习：朗读一段文章，知道哪里需要改；跟 AI 教练一起修改作文；把文字转成音频，用来练听力和跟读；不离开工作台就能翻译。",
  "english.signInToStart": "登录后开始",
  "english.modules": "模块",
  "english.soon": "即将推出",
  "english.noteTitle": "一个账号，进度共享",
  "english.noteBody":
    "所有模块共用同一个 Google 登录和同一套设计。你的练习会汇入同一份学习者档案（听写和朗读都会计入），练习记录只有你自己能看到。",
  "english.viewProgress": "查看我的进度 →",

  // --- studio navigation rail ---
  "rail.openNav": "打开导航",
  "rail.closeNav": "关闭导航",
  "rail.navDialog": "English Studio 导航",
  "rail.backHome": "返回 bcailab 首页",
  "rail.expand": "展开侧栏",
  "rail.collapse": "收起侧栏",

  // --- dictation library ---
  "dictation.title": "听写",
  "dictation.intro": "逐句听一段文章，把听到的内容打出来。每一句都会立即给出反馈。",
  "dictation.introAnonymous": "无需账号即可开始。",
  "dictation.workspace": "我的练习",
  "dictation.recent": "最近练习",
  "dictation.fullProgress": "完整进度 →",
  "dictation.attempts": "练过 {count} 次",
  "dictation.attemptsBest": "练过 {count} 次 · 最佳 {best}%",
  "dictation.inProgressDone": "进行中 · 已完成 {done} 句",
  "dictation.empty": "暂时还没有可以练习的文章。",
  "dictation.band.A2": "日常短句，简单时态。",
  "dictation.band.B1": "日常叙述，常用连接词。",
  "dictation.band.B2": "时态多样，有观点和对比。",
  "dictation.band.C1": "复杂句式，用词细腻。",
  "dictation.sentences": "{count} 句",
  "dictation.best": "最佳 {pct}%",
  "dictation.notStarted": "未开始",

  // --- dictation session ---
  "dictation.unknownSentence": "找不到这一句。",
  "dictation.malformed": "提交的数据格式有误。",
  "dictation.quotaSignedIn": "今天的听写次数已经用完，请明天再来。",
  "dictation.quotaAnonymous": "今天的免费听写次数已经用完。登录后可以继续练习，登录是免费的。",
  "dictation.gateTitle": "明天再来",
  "dictation.backToLibrary": "返回文章列表",
  "dictation.backToDictation": "返回听写",
  "dictation.feedbackPending": "正在分析你的错误规律…",
  "dictation.feedbackTitle": "接下来要练的",
  "dictation.overallAccuracy": "总正确率",
  "dictation.replayOne": "重听 {count} 次",
  "dictation.replayMany": "重听 {count} 次",
  "dictation.blank": "（未作答）",
  "dictation.handoff": "这段文章的词你已经都知道了。现在把它朗读出来，听听关于发音和节奏的反馈。",
  "dictation.readAloud": "朗读这段",
  "dictation.signInCta": "登录后可以保存进度，并获得教练针对你错误规律的反馈。",
  "dictation.sentenceOf": "第 {current} 句，共 {total} 句",
  "dictation.playSentence": "播放这一句",
  "dictation.playAgain": "再播放一次",
  "dictation.loading": "加载中…",
  "dictation.playing": "播放中…",
  "dictation.play": "播放",
  "dictation.replay": "重播",
  "dictation.playbackSpeed": "播放速度",
  "dictation.listens": "已听 {count} 遍",
  "dictation.yourAnswer": "你的答案",
  "dictation.placeholder": "把听到的内容打出来…",
  "dictation.correct": "正确率 {pct}%",
  "dictation.scoring": "评分中…",
  "dictation.finish": "完成",
  "dictation.nextSentence": "下一句",
  "dictation.checking": "检查中…",
  "dictation.check": "检查",

  // --- sign-in popup ---
  "login.title": "登录 bcailab",
  "login.google": "使用 Google 继续",
  "login.orEmail": "或使用邮箱",
  "login.email": "邮箱地址",
  "login.password": "密码",
  "login.newPassword": "新密码",
  "login.signingIn": "登录中…",
  "login.useCode": "改用邮箱验证码登录",
  "login.usePassword": "改用密码登录",
  "login.forgot": "忘记了密码，或者从没设置过？",
  "login.sending": "发送中…",
  "login.sendReset": "发送重置验证码",
  "login.backToPassword": "返回密码登录",
  "login.enterCode": "请输入发送到 {email} 的 6 位验证码",
  "login.passwordMin": "至少 {min} 个字符",
  "login.devCode": "开发模式：你的验证码是 {code}",
  "login.saving": "保存中…",
  "login.setPassword": "设置密码并登录",
  "login.differentEmail": "换一个邮箱",
  "login.sendCode": "发送登录验证码",
  "login.verifying": "验证中…",
  "login.verify": "验证并登录",
  "login.error.email": "请输入有效的邮箱地址。",
  "login.error.credentials": "邮箱或密码不正确。",
  "login.error.codeFormat": "请输入邮件里的 6 位验证码。",
  "login.error.passwordLength": "请设置至少 {min} 个字符的密码。",
  "login.error.notConfigured": "当前部署没有配置邮箱登录。",
  "login.error.rateLimited": "请求验证码的次数太多了，请稍后再试。",
  "login.error.sendFailed": "邮件没能发出，请重试。",
  "login.error.expired": "验证码已过期或不存在，请重新获取。",
  "login.error.tooManyAttempts": "尝试次数太多，请重新获取验证码。",
  "login.error.incorrectCode": "验证码不正确，请检查后重试。"
};
