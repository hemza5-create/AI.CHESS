import type { SupportedLanguage } from '../i18n/translations.ts';

export type CoachTacticId = 'fork' | 'pin' | 'discovered' | 'mateIn1' | 'backRank';

export interface CoachLocalizedCopy {
  title: string;
  prompt: string;
  hintText: string;
  correctExplanation: string;
  wrongHint: string;
}

export interface CoachDrill {
  id: string;
  tactic: CoachTacticId;
  fen: string;
  solutionUci: string;
  solutionSan: string;
  targetSideLabel: 'w' | 'b';
  localized: Record<SupportedLanguage, CoachLocalizedCopy>;
}

export const COACH_DRILLS: CoachDrill[] = [
  // ==================== FORK (شوكة) ====================
  {
    id: 'fork-1',
    tactic: 'fork',
    fen: '2k5/5q1p/8/8/2N5/8/P6P/4K3 w - - 0 1',
    solutionUci: 'c4d6',
    solutionSan: 'Nd6+',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'الشوكة الملكية بالحصان',
        prompt: 'الأبيض يلعب. نفّذ نقلة شوكة بالحصان تهاجم الملك والوزير معاً.',
        hintText: 'انقل الحصان من c4 إلى مربع يعطي كشاً للملك ويهدد الوزير في f7.',
        correctExplanation:
          'أحسنت! نقلة Nd6+ تصنع شوكة ملكية مزدوجة: تهاجم الملك على c8 والوزير على f7 في آنٍ واحد. على الأسود تحريك الملك فتكسب الوزير مجاناً.',
        wrongHint:
          'هذه النقلة لا تنفّذ شوكة مزدوجة على الملك والوزير. ابحث عن قفزة للحصان تعطي كشاً إجبارياً.',
      },
      en: {
        title: 'Royal Knight Fork',
        prompt: 'White to move. Deliver a knight fork attacking the king and queen together.',
        hintText: 'Jump the knight from c4 to check the king on c8 while hitting the queen on f7.',
        correctExplanation:
          'Great! Nd6+ executes a royal fork against the king (c8) and queen (f7). Black must escape check, losing the queen.',
        wrongHint:
          'That move misses the double attack. Look for a knight check that hits both royal pieces at once.',
      },
      ru: {
        title: 'Королевская коневая вилка',
        prompt: 'Ход белых. Сделайте коневую вилку на короля и ферзя одновременно.',
        hintText: 'Прыгните конём с c4 так, чтобы объявить шах и атаковать ферзя на f7.',
        correctExplanation:
          'Отлично! Ход Nd6+ создаёт двойной удар: шах королю на c8 и нападение на ферзя f7. Чёрные обязаны уйти от шаха и теряют ферзя.',
        wrongHint:
          'Этот ход не создаёт вилку. Найдите прыжок коня с шахом, одновременно атакующий ферзя.',
      },
      zh: {
        title: '马的双重捉击（王后叉）',
        prompt: '白方先走。走出一步马的捉双，同时攻击黑王与黑后。',
        hintText: '将 c4 的马跳到一个既能将军又能攻击 f7 黑后的格子。',
        correctExplanation:
          '漂亮！Nd6+ 形成经典的王后捉双：同时将军 c8 黑王并攻击 f7 黑后。黑方必须应将，白方顺势吃掉黑后。',
        wrongHint: '这步棋没有构成双吃。寻找能直接将军并同时威胁黑后的马跳步。',
      },
      fr: {
        title: 'Fourchette royale du cavalier',
        prompt: 'Aux Blancs de jouer. Réalisez une fourchette attaquant roi et dame simultanément.',
        hintText: 'Sautez avec le cavalier de c4 pour donner échec au roi et attaquer la dame en f7.',
        correctExplanation:
          'Bravo ! Nd6+ réalise une fourchette royale sur le roi en c8 et la dame en f7. Les Noirs doivent parer l’échec et perdent la dame.',
        wrongHint:
          'Ce coup ne crée pas de double attaque. Cherchez un échec de cavalier qui menace aussi la dame.',
      },
    },
  },
  {
    id: 'fork-2',
    tactic: 'fork',
    fen: '5k2/p1q5/8/8/5N2/8/P6P/3K4 w - - 0 1',
    solutionUci: 'f4e6',
    solutionSan: 'Ne6+',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'شوكة الحصان على المربع e6',
        prompt: 'الأبيض يلعب. استغل اصطفاف الملك والوزير لتنفيذ شوكة حاسمة.',
        hintText: 'حرّك الحصان إلى المربع e6 ليضرب الملك في f8 والوزير في c7.',
        correctExplanation:
          'ممتاز! نقلة Ne6+ تضرب الملك على f8 والوزير على c7 في نقلة واحدة دون أن يتمكن أي بيدق من التغطية أو الأسر.',
        wrongHint: 'فكّر في المربعات التي يستطيع الحصان مهاجمتها من f4 لإعطاء كش ومهاجمة الوزير.',
      },
      en: {
        title: 'Knight Fork on e6',
        prompt: 'White to move. Exploit the king and queen alignment with a decisive fork.',
        hintText: 'Move the knight to e6 to attack both the king on f8 and queen on c7.',
        correctExplanation:
          'Excellent! Ne6+ forks the f8 king and c7 queen cleanly on a safe square.',
        wrongHint: 'Look at squares reachable from f4 that deliver check while attacking c7.',
      },
      ru: {
        title: 'Коневая вилка на e6',
        prompt: 'Ход белых. Используйте расположение короля и ферзя для решающей вилки.',
        hintText: 'Сыграйте конём на e6, атакуя короля на f8 и ферзя на c7.',
        correctExplanation:
          'Превосходно! Ne6+ ставит вилку на короля f8 и ферзя c7 на безопасном поле.',
        wrongHint: 'Ищите поле для коня с f4, дающее шах и атаку на c7.',
      },
      zh: {
        title: 'e6 格马的捉双',
        prompt: '白方先走。利用黑王和黑后的位置关系走出决定性捉双。',
        hintText: '将马跳到 e6，同时攻击 f8 的王和 c7 的后。',
        correctExplanation: '精彩！Ne6+ 在安全格上同时将军 f8 并攻击 c7 黑后，白方稳赚黑后。',
        wrongHint: '检查马从 f4 能到达的格子，找到既能将军又能捉 c7 后的那一步。',
      },
      fr: {
        title: 'Fourchette du cavalier en e6',
        prompt: 'Aux Blancs de jouer. Exploitez la position du roi et de la dame pour une fourchette.',
        hintText: 'Jouez le cavalier en e6 pour attaquer le roi en f8 et la dame en c7.',
        correctExplanation:
          'Excellent ! Ne6+ attaque simultanément le roi en f8 et la dame en c7 sur une case sûre.',
        wrongHint: 'Cherchez une case accessible depuis f4 qui donne échec tout en menaçant c7.',
      },
    },
  },
  {
    id: 'fork-3',
    tactic: 'fork',
    fen: '7k/r1p2p1p/3p4/8/8/8/6PP/3Q2K1 w - - 0 1',
    solutionUci: 'd1d4',
    solutionSan: 'Qd4+',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'شوكة الوزير القطرية',
        prompt: 'الأبيض يلعب. استخدم الوزير لإعطاء كش للملك ومهاجمة الرخ معاً.',
        hintText: 'ضع الوزير في منتصف الرقعة على المربع d4 لمهاجمة الرخ في a7 والملك في h8.',
        correctExplanation:
          'رائع! نقلة Qd4+ تشن هجوماً مزدوجاً عبر القطرين: تعطي كشاً للملك على h8 وتهدد الرخ في a7 في نفس اللحظة.',
        wrongHint: 'الوزير يحتاج لاحتلال مربع يربط قطرياً بين الملك والرخ غير المحمي.',
      },
      en: {
        title: 'Diagonal Queen Fork',
        prompt: 'White to move. Use the queen to check the king and attack the rook simultaneously.',
        hintText: 'Place the queen on the central square d4 to hit both h8 and a7 diagonally.',
        correctExplanation:
          'Well played! Qd4+ attacks along both diagonals at once, checking the h8 king and winning the undefended rook on a7.',
        wrongHint: 'Find a central square where the queen aligns diagonally with both the king and rook.',
      },
      ru: {
        title: 'Диагональная вилка ферзём',
        prompt: 'Ход белых. Дайте шах королю ферзём и одновременно атакуйте ладью.',
        hintText: 'Поставьте ферзя на центральное поле d4, атакуя h8 и a7 по диагоналям.',
        correctExplanation:
          'Отлично! Qd4+ бьёт сразу по двум диагоналям: шах королю h8 и нападение на ладью a7.',
        wrongHint: 'Найдите поле для ферзя, откуда он по диагоналям атакует и короля, и ладью.',
      },
      zh: {
        title: '皇后的斜线捉双',
        prompt: '白方先走。用皇后同时将军黑王并攻击黑车。',
        hintText: '将白后走到中心 d4 格，两条斜线分别瞄准 h8 与 a7。',
        correctExplanation: '干得好！Qd4+ 通过两条斜线同时将军 h8 并攻击无根黑车 a7，轻松赢车。',
        wrongHint: '寻找能让皇后在斜线上同时对准黑王和黑车的中心位置。',
      },
      fr: {
        title: 'Fourchette diagonale de la dame',
        prompt: 'Aux Blancs de jouer. Donnez échec au roi et attaquez la tour en même temps.',
        hintText: 'Placez la dame au centre sur d4 pour viser h8 et a7 en diagonale.',
        correctExplanation:
          'Bien joué ! Qd4+ frappe sur deux diagonales : échec au roi en h8 et attaque de la tour en a7.',
        wrongHint: 'Cherchez une case centrale alignée en diagonale avec le roi et la tour.',
      },
    },
  },

  // ==================== PIN (ربط) ====================
  {
    id: 'pin-1',
    tactic: 'pin',
    fen: '6k1/7p/4q3/8/8/8/P4P2/3B2K1 w - - 0 1',
    solutionUci: 'd1b3',
    solutionSan: 'Bb3',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'الربط المطلق للوزير بالفيل',
        prompt: 'الأبيض يلعب. اربط وزير الأسود بملكه لتكسب التفوق المادي.',
        hintText: 'حرّك الفيل إلى المربع b3 المحمي بالبيدق a2 ليربط الوزير في e6.',
        correctExplanation:
          'ممتاز! نقلة Bb3 تفرض ربطاً مطلقاً على الوزير في e6 أمام الملك في g8. ولأن الفيل محمي بالبيدق a2، سيخسر الأسود وزيره مقابل الفيل فقط.',
        wrongHint: 'حاول محاذاة الفيل على القطر نفسه الذي يضم الملك والوزير مع حماية الفيل.',
      },
      en: {
        title: 'Absolute Bishop Pin',
        prompt: 'White to move. Pin the Black queen against her king to win material.',
        hintText: 'Play the bishop to b3—protected by the a2 pawn—to pin the e6 queen to g8.',
        correctExplanation:
          'Spot on! Bb3 creates an absolute pin along the a2–g8 diagonal. Since a2 defends b3, Black must trade the queen for a bishop.',
        wrongHint: 'Align your bishop on the same diagonal as the queen and king while keeping it defended.',
      },
      ru: {
        title: 'Абсолютная связка слоном',
        prompt: 'Ход белых. Свяжите чёрного ферзя с королём, чтобы выиграть материал.',
        hintText: 'Поставьте слона на b3 под защиту пешки a2, связывая ферзя e6 с королём g8.',
        correctExplanation:
          'Точно! Bb3 создаёт абсолютную связку по диагонали a2–g8. Пешка a2 защищает слона, и чёрные теряют ферзя.',
        wrongHint: 'Поставьте слона на одну диагональ с ферзём и королём под защитой своей пешки.',
      },
      zh: {
        title: '象的绝对牵制',
        prompt: '白方先走。将黑后牵制在黑王身前，借此赢得大子优势。',
        hintText: '把象走到受 a2 兵保护的 b3 格，将 e6 黑后钉死在 g8 黑王前。',
        correctExplanation:
          '精准！Bb3 在 a2–g8 斜线上形成绝对牵制。由于 b3 受 a2 兵保护，黑方只能用后换象。',
        wrongHint: '将白象放到与黑后、黑王同一条斜线上，并确保白象受到保护。',
      },
      fr: {
        title: 'Clouage absolu du fou',
        prompt: 'Aux Blancs de jouer. Clouez la dame noire devant son roi pour gagner du matériel.',
        hintText: 'Jouez le fou en b3, défendu par le pion a2, pour clouer la dame en e6.',
        correctExplanation:
          'Parfait ! Bb3 crée un clouage absolu sur la diagonale a2–g8. Protégé par a2, le fou gagne la dame.',
        wrongHint: 'Alignez votre fou sur la même diagonale que la dame et le roi, sous protection.',
      },
    },
  },
  {
    id: 'pin-2',
    tactic: 'pin',
    fen: '4k3/5p2/5p2/4q3/8/8/5PPP/3R1K2 w - - 0 1',
    solutionUci: 'd1e1',
    solutionSan: 'Re1',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'ربط الوزير على العمود المفتوح',
        prompt: 'الأبيض يلعب. اربط وزير الأسود بالملك على عمود e مستفيداً من حماية ملكك.',
        hintText: 'حرّك الرخ إلى e1 ليواجه الوزير في e5 والملك في e8.',
        correctExplanation:
          'أحسنت! نقلة Re1 تربط الوزير في e5 بالملك على عمود e المفتوح. وبما أن الملك الأبيض في f1 يحمي الرخ، يضطر الأسود لتسليم وزيره مقابل الرخ.',
        wrongHint: 'استغل اصطفاف الملك والوزير على عمود e المفتوح لفرض ربط قاتل.',
      },
      en: {
        title: 'Open-File Rook Pin',
        prompt: 'White to move. Pin the Black queen along the e-file with king support.',
        hintText: 'Slide the rook to e1 to face both the e5 queen and the e8 king.',
        correctExplanation:
          'Well done! Re1 pins the queen to her king along the e-file. Because Kf1 defends e1, Black cannot avoid losing the queen for the rook.',
        wrongHint: 'Use the open e-file where Black’s queen sits directly in front of the king.',
      },
      ru: {
        title: 'Связка ладьёй по открытой линии',
        prompt: 'Ход белых. Свяжите ферзя по вертикали e при поддержке своего короля.',
        hintText: 'Переведите ладью на e1, выстраивая её напротив ферзя e5 и короля e8.',
        correctExplanation:
          'Отлично! Re1 связывает ферзя с королём по линии e. Король f1 защищает ладью, поэтому чёрные теряют ферзя.',
        wrongHint: 'Используйте открытую линию e, где ферзь стоит прямо перед королём.',
      },
      zh: {
        title: '开放线路车的牵制',
        prompt: '白方先走。在白王保护下，沿 e 线牵制黑后。',
        hintText: '将车移至 e1，使黑后 e5 被钉死在黑王 e8 身前。',
        correctExplanation:
          '走得好！Re1 沿开放的 e 线将黑后牵制在黑王身前，且白王 f1 保护 e1，黑方被迫丢后。',
        wrongHint: '利用黑后正对黑王的开放 e 线制造绝对牵制。',
      },
      fr: {
        title: 'Clouage de la tour sur colonne ouverte',
        prompt: 'Aux Blancs de jouer. Clouez la dame sur la colonne e avec le soutien du roi.',
        hintText: 'Placez la tour en e1 face à la dame en e5 et au roi en e8.',
        correctExplanation:
          'Bien joué ! Re1 cloue la dame sur son roi. Comme Kf1 défend e1, la dame est perdue pour la tour.',
        wrongHint: 'Profitez de la colonne e ouverte où la dame se trouve juste devant le roi.',
      },
    },
  },
  {
    id: 'pin-3',
    tactic: 'pin',
    fen: '6k1/p4rpp/8/8/8/8/P4PPP/R2B2K1 w - - 0 1',
    solutionUci: 'd1b3',
    solutionSan: 'Bb3',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'ربط الرخ وكسب الفرق',
        prompt: 'الأبيض يلعب. اربط رخ الأسود في f7 بملكه في g8.',
        hintText: 'انقل الفيل من d1 إلى b3 ليمنع الرخ من الحركة.',
        correctExplanation:
          'صحيح! نقلة Bb3 تربط الرخ في f7 ربطاً مطلقاً بالملك في g8. ومع حماية البيدق a2 للفيل، يربح الأبيض الرخ مقابل الفيل (كسب الفرق).',
        wrongHint: 'فكّر في القطر الذي يربط f7 مع g8 وضع الفيل عليه بأمان.',
      },
      en: {
        title: 'Pinning the Rook for the Exchange',
        prompt: 'White to move. Pin the Black rook on f7 to the king on g8.',
        hintText: 'Move your bishop from d1 to b3 so the f7 rook cannot move.',
        correctExplanation:
          'Correct! Bb3 creates an absolute pin on the f7 rook. Protected by the a2 pawn, White wins the rook for the bishop.',
        wrongHint: 'Look at the diagonal connecting f7 and g8 and place your bishop there safely.',
      },
      ru: {
        title: 'Связка ладьи с выигрышем качества',
        prompt: 'Ход белых. Свяжите ладью на f7 с королём на g8.',
        hintText: 'Сыграйте слоном с d1 на b3, полностью обездвижив ладью f7.',
        correctExplanation:
          'Верно! Bb3 создаёт абсолютную связку ладьи f7. Под защитой пешки a2 белые выигрывают качество.',
        wrongHint: 'Посмотрите на диагональ, соединяющую f7 и g8, и атакуйте по ней.',
      },
      zh: {
        title: '牵制黑车赚取兑换优势',
        prompt: '白方先走。将 f7 的黑车牵制在 g8 黑王身前。',
        hintText: '把象从 d1 走到 b3，限制 f7 车的移动。',
        correctExplanation: '正确！Bb3 对 f7 黑车形成绝对牵制，受 a2 兵保护，白方稳赚子力差。',
        wrongHint: '观察连接 f7 与 g8 的斜线，将象安全置于其上。',
      },
      fr: {
        title: 'Clouer la tour pour gagner la qualité',
        prompt: 'Aux Blancs de jouer. Clouez la tour noire en f7 sur le roi en g8.',
        hintText: 'Déplacez le fou de d1 en b3 pour immobiliser la tour en f7.',
        correctExplanation:
          'Exact ! Bb3 cloue la tour en f7 devant le roi. Défendu par le pion a2, le fou gagne la qualité.',
        wrongHint: 'Repérez la diagonale reliant f7 à g8 et placez-y votre fou en sécurité.',
      },
    },
  },

  // ==================== DISCOVERED ATTACK (كشف هجوم) ====================
  {
    id: 'discovered-1',
    tactic: 'discovered',
    fen: '4k3/q7/8/4B3/8/2P5/6P1/4R1K1 w - - 0 1',
    solutionUci: 'e5d4',
    solutionSan: 'Bd4+',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'كشف الكش ومهاجمة الوزير',
        prompt: 'الأبيض يلعب. اسحب الفيل ليفتح كشاً من الرخ بينما يهدد الوزير.',
        hintText: 'انقل الفيل من e5 إلى d4 ليحمي البيدق c3 ظهره، مع كشف كش الرخ ومهاجمة Qa7.',
        correctExplanation:
          'تكتيك رائع! نقلة Bd4+ تسحب الحاجز من أمام الرخ e1 لتعطي كشاً بالكشف لملك e8، وفي نفس الوقت يهاجم الفيلُ المحميّ الوزيرَ على a7!',
        wrongHint: 'أزِح الفيل من عمود e نحو مربع يهدد فيه وزير الأسود في a7.',
      },
      en: {
        title: 'Discovered Check Winning the Queen',
        prompt: 'White to move. Uncover a rook check while attacking the Black queen.',
        hintText: 'Retreat the bishop from e5 to d4—protected by c3—to hit a7 and uncover Re1+.',
        correctExplanation:
          'Brilliant tactic! Bd4+ uncovers a check from the e1 rook while simultaneously attacking the queen on a7.',
        wrongHint: 'Move the e5 bishop off the e-file to a square that targets the queen on a7.',
      },
      ru: {
        title: 'Вскрытый шах с атакой ферзя',
        prompt: 'Ход белых. Откройте шах ладьёй и одновременно атакуйте чёрного ферзя.',
        hintText: 'Отведите слона с e5 на d4 под защиту пешки c3, нападая на a7 и вскрывая Re1+.',
        correctExplanation:
          'Блестяще! Bd4+ открывает шах от ладьи e1 и в то же время атакует ферзя на a7.',
        wrongHint: 'Уведите слона с линии e на поле, с которого он угрожает ферзю на a7.',
      },
      zh: {
        title: '闪击将军并捉后',
        prompt: '白方先走。移开象以露出车的将军，同时反击黑后。',
        hintText: '将 e5 象退至受 c3 保护的 d4 格，既攻击 a7 黑后又闪出 Re1 将军。',
        correctExplanation: '妙手！Bd4+ 移开挡路的象，露出 e1 车对黑王的将军，同时稳稳攻击 a7 黑后。',
        wrongHint: '将象从 e 线移走，落到一个能攻击 a7 黑后的格子里。',
      },
      fr: {
        title: 'Échec à la découverte gagnant la dame',
        prompt: 'Aux Blancs de jouer. Dévoilez un échec de la tour tout en attaquant la dame.',
        hintText: 'Reculez le fou de e5 en d4 (protégé par c3) pour menacer a7 et découvrir Re1+.',
        correctExplanation:
          'Superbe tactique ! Bd4+ libère l’échec de la tour e1 contre le roi tout en attaquant la dame en a7.',
        wrongHint: 'Écartez le fou de la colonne e vers une case qui menace la dame en a7.',
      },
    },
  },
  {
    id: 'discovered-2',
    tactic: 'discovered',
    fen: '4k3/8/3q4/4N3/8/1P6/6P1/4R1K1 w - - 0 1',
    solutionUci: 'e5c4',
    solutionSan: 'Nc4+',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'هجوم كاشف بالحصان والرخ',
        prompt: 'الأبيض يلعب. اقفز بالحصان لفتح كش الرخ ومهاجمة الوزير في d6.',
        hintText: 'حرّك الحصان إلى c4 المحمي بالبيدق b3 ليهاجم الوزير أثناء كش الرخ.',
        correctExplanation:
          'ضربة دقيقة! نقلة Nc4+ تكشف كش الرخ من e1 ضد الملك في e8، وتهاجم الوزير على d6 بحماية البيدق b3، ما يجبر الأسود على خسارة الوزير.',
        wrongHint: 'ابحث عن قفزة للحصان من e5 تهدد الوزير في d6 وتفتح عمود e للرخ.',
      },
      en: {
        title: 'Knight Uncovers Rook Check',
        prompt: 'White to move. Jump the knight to uncover a rook check and attack the d6 queen.',
        hintText: 'Move the knight to c4, defended by b3, to hit d6 while revealing Re1+.',
        correctExplanation:
          'Sharp play! Nc4+ discovers check from the e1 rook and attacks the d6 queen at the same time, winning the queen.',
        wrongHint: 'Look for a knight jump from e5 that leaves the e-file open and hits d6.',
      },
      ru: {
        title: 'Вскрытый шах конём и ладьёй',
        prompt: 'Ход белых. Отпрыгните конём, вскрывая шах ладьи и атакуя ферзя d6.',
        hintText: 'Поставьте коня на c4 под защиту пешки b3, атакуя d6 при вскрытом шахе Re1+.',
        correctExplanation:
          'Точный удар! Nc4+ открывает шах ладьёй e1 и одновременно атакует ферзя на d6, выигрывая его.',
        wrongHint: 'Найдите прыжок коня с e5, открывающий линию e и атакующий ферзя на d6.',
      },
      zh: {
        title: '闪击：马跳车将攻黑后',
        prompt: '白方先走。跳开马以闪出车的将军，同时攻击 d6 黑后。',
        hintText: '把马跳到受 b3 兵保护的 c4 格，在闪将的同时威胁 d6 黑后。',
        correctExplanation: '犀利！Nc4+ 让出 e 线由车直接将军黑王，同时利用受保护的马攻击 d6 黑后。',
        wrongHint: '寻找马从 e5 跳开并直接威胁 d6 黑后的着法。',
      },
      fr: {
        title: 'Échec à la découverte avec le cavalier',
        prompt: 'Aux Blancs de jouer. Sautez du cavalier pour découvrir un échec et attaquer d6.',
        hintText: 'Jouez le cavalier en c4, protégé par b3, pour viser d6 et ouvrir Re1+.',
        correctExplanation:
          'Coup précis ! Nc4+ découvre l’échec de la tour e1 et attaque la dame en d6 simultanément.',
        wrongHint: 'Cherchez un saut de cavalier depuis e5 qui libère la colonne e et menace d6.',
      },
    },
  },
  {
    id: 'discovered-3',
    tactic: 'discovered',
    fen: '6k1/2q1p2p/8/3P2N1/8/8/5P1P/6RK w - - 0 1',
    solutionUci: 'g5e6',
    solutionSan: 'Ne6+',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'كشف الهجوم على عمود g',
        prompt: 'الأبيض يلعب. افتح عمود g أمام الرخ واضرب الوزير في c7 بالحصان.',
        hintText: 'انقل الحصان من g5 إلى e6 المحمي بالبيدق d5.',
        correctExplanation:
          'نموذجي! نقلة Ne6+ تكشف كشاً من الرخ Rg1 ضد الملك في g8، وفي اللحظة نفسها يهاجم الحصانُ المحمي بالبيدق d5 وزيرَ الأسود في c7.',
        wrongHint: 'ارفع الحصان من عمود g نحو مربع يهدد فيه الوزير في c7.',
      },
      en: {
        title: 'G-File Discovered Check',
        prompt: 'White to move. Clear the g-file for your rook while hitting the c7 queen.',
        hintText: 'Jump the knight from g5 to e6, supported by the d5 pawn.',
        correctExplanation:
          'Textbook tactic! Ne6+ uncovers a check from Rg1 on the g-file while attacking the c7 queen on a pawn-defended square.',
        wrongHint: 'Move the g5 knight to a square where it attacks c7 and opens the g-file.',
      },
      ru: {
        title: 'Вскрытый шах по линии g',
        prompt: 'Ход белых. Откройте линию g для ладьи и атакуйте ферзя на c7.',
        hintText: 'Прыгните конём с g5 на e6 под защиту пешки d5.',
        correctExplanation:
          'Учебный приём! Ne6+ открывает шах ладьи Rg1 по вертикали g и атакует ферзя c7 с защищённого поля.',
        wrongHint: 'Уведите коня с g5 на поле, атакующее c7 и открывающее линию g.',
      },
      zh: {
        title: 'g 线闪击得后',
        prompt: '白方先走。移开 g 线的马放出车将，并直接攻击 c7 的黑后。',
        hintText: '将 g5 马跳至受 d5 兵保护的 e6 格。',
        correctExplanation: '教科书级的闪击！Ne6+ 放出 Rg1 的将军，同时攻击 c7 黑后，白方稳赚黑后。',
        wrongHint: '将 g5 马移开以畅通 g 线，同时瞄准 c7 的黑后。',
      },
      fr: {
        title: 'Échec à la découverte sur la colonne g',
        prompt: 'Aux Blancs de jouer. Libérez la colonne g pour votre tour et attaquez c7.',
        hintText: 'Sautez avec le cavalier de g5 en e6 sous la protection du pion d5.',
        correctExplanation:
          'Classique ! Ne6+ révèle l’échec de Rg1 sur la colonne g tout en attaquant la dame en c7.',
        wrongHint: 'Déplacez le cavalier g5 vers une case menaçant c7 tout en ouvrant la colonne g.',
      },
    },
  },

  // ==================== MATE IN 1 (مات في نقلة واحدة) ====================
  {
    id: 'mateIn1-1',
    tactic: 'mateIn1',
    fen: '5r1k/5ppp/8/8/8/2Q5/1B4PP/6K1 w - - 0 1',
    solutionUci: 'c3g7',
    solutionSan: 'Qxg7#',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'بطارية الوزير والفيل',
        prompt: 'الأبيض يلعب. نفّذ كش مات في نقلة واحدة مستفيداً من الفيل على b2.',
        hintText: 'التهم البيدق في g7 بالوزير تحت حماية الفيل b2.',
        correctExplanation:
          'كش مات! نقلة Qxg7# تستفيد من دعم الفيل b2 عبر القطر الطويل، فلا يستطيع ملك h8 أسر الوزير أو الفرار لوجود بيادق f7 وh7.',
        wrongHint: 'ابحث عن تقاطع الوزير مع قطر الفيل b2 لإصابة نقطة ضعف الملك في g7.',
      },
      en: {
        title: 'Queen & Bishop Battery Mate',
        prompt: 'White to move. Deliver checkmate in one move using the b2 bishop support.',
        hintText: 'Capture the g7 pawn with the queen, backed by the bishop on b2.',
        correctExplanation:
          'Checkmate! Qxg7# lands directly in front of the Black king, supported by Bb2 so the king cannot capture.',
        wrongHint: 'Look at the g7 square targeted along the long diagonal by your b2 bishop.',
      },
      ru: {
        title: 'Мат батареей ферзя и слона',
        prompt: 'Ход белых. Поставьте мат в 1 ход при поддержке слона b2.',
        hintText: 'Возьмите пешку g7 ферзём под защитой слона b2.',
        correctExplanation:
          'Мат! Qxg7# наносит решающий удар: слон b2 защищает ферзя, а у короля h8 нет полей отступления.',
        wrongHint: 'Обратите внимание на ослабленное поле g7 под прицелом слона b2.',
      },
      zh: {
        title: '后象配合一步杀',
        prompt: '白方先走。借助 b2 象的支援在一步之内将死黑方。',
        hintText: '用白后吃掉 g7 兵，由 b2 象提供保护。',
        correctExplanation: '将杀！Qxg7# 得到 b2 象的坚实保护，黑王无路可逃也无法反吃白后。',
        wrongHint: '关注受 b2 象瞄准的大斜线弱点 g7 格。',
      },
      fr: {
        title: 'Mat avec la batterie dame-fou',
        prompt: 'Aux Blancs de jouer. Faites échec et mat en 1 coup grâce au fou en b2.',
        hintText: 'Prenez le pion g7 avec la dame sous la protection du fou b2.',
        correctExplanation:
          'Échec et mat ! Qxg7# est défendu par le fou en b2, laissant le roi en h8 sans aucune fuite.',
        wrongHint: 'Visez la case g7 déjà attaquée sur la grande diagonale par le fou b2.',
      },
    },
  },
  {
    id: 'mateIn1-2',
    tactic: 'mateIn1',
    fen: '8/5K1k/p7/8/8/8/P7/1R6 w - - 0 1',
    solutionUci: 'b1h1',
    solutionSan: 'Rh1#',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'مات الرخ والملك على الحافة',
        prompt: 'الأبيض يلعب. استخدم تعاون الملك والرخ لتنفيذ كش مات فوري.',
        hintText: 'انقل الرخ إلى عمود h في المربع h1.',
        correctExplanation:
          'كش مات جميل! نقلة Rh1# تهاجم الملك على طول عمود h، والملك الأبيض في f7 يقطع مربعي الهروب g8 وg7 وg6 بالكامل.',
        wrongHint: 'الملك الأبيض في f7 يراقب عمود g؛ اضرب الملك بالرخ على عمود h.',
      },
      en: {
        title: 'King & Rook Edge Mate',
        prompt: 'White to move. Coordinate king and rook for an instant mate on the edge.',
        hintText: 'Swing the rook to h1 to check along the h-file.',
        correctExplanation:
          'Clean checkmate! Rh1# delivers check on the h-file while Kf7 seals off every escape square on the g-file.',
        wrongHint: 'Your king on f7 already cuts off the g-file—deliver check along the h-file.',
      },
      ru: {
        title: 'Линейный мат ладьёй на краю',
        prompt: 'Ход белых. Взаимодействием короля и ладьи поставьте мат в 1 ход.',
        hintText: 'Переведите ладью на h1, объявляя шах по вертикали h.',
        correctExplanation:
          'Чистый мат! Rh1# атакует короля по линии h, а белый король на f7 отрезает все поля по линии g.',
        wrongHint: 'Король f7 уже перекрывает линию g — дайте шах ладьёй по вертикали h.',
      },
      zh: {
        title: '王车底边一步杀',
        prompt: '白方先走。配合白王与白车的位置完成底边一步杀。',
        hintText: '把车平移到 h1，沿 h 线将军。',
        correctExplanation: '干净利落的一步杀！Rh1# 封锁 h 线，白王 f7 守住 g 线的所有退路。',
        wrongHint: 'f7 的白王已经封锁了 g 线，用白车沿 h 线直接将军即可。',
      },
      fr: {
        title: 'Mat du couloir avec roi et tour',
        prompt: 'Aux Blancs de jouer. Coordonnez roi et tour pour mater immédiatement au bord.',
        hintText: 'Glissez la tour en h1 pour faire échec sur la colonne h.',
        correctExplanation:
          'Mat net ! Rh1# coupe toute la colonne h tandis que Kf7 bloque les cases de fuite en g.',
        wrongHint: 'Votre roi en f7 contrôle la colonne g ; attaquez sur la colonne h avec la tour.',
      },
    },
  },
  {
    id: 'mateIn1-3',
    tactic: 'mateIn1',
    fen: '6rk/6pp/8/6N1/8/8/5PPP/6K1 w - - 0 1',
    solutionUci: 'g5f7',
    solutionSan: 'Nf7#',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'المات المخنوق بالحصان',
        prompt: 'الأبيض يلعب. استغل حصار قطع الأسود لملكه لتنفيذ المات المخنوق.',
        hintText: 'اقفز بالحصان إلى المربع f7.',
        correctExplanation:
          'كش مات مخنوق! نقلة Nf7# تعطي كشاً لا يُصد لملك h8 المحاصر تماماً برخّه وبيادقه g7 وh7.',
        wrongHint: 'الأسود يحاصر ملكه بنفسه؛ ابحث عن قفزة الحصان التي تصل إلى الملك في h8.',
      },
      en: {
        title: 'Smothered Knight Mate',
        prompt: 'White to move. Punish the cramped Black king with a smothered mate.',
        hintText: 'Jump the knight to f7 to checkmate the trapped king.',
        correctExplanation:
          'Smothered mate! Nf7# delivers an unblockable knight check while Black’s own rook and pawns trap the king.',
        wrongHint: 'Black’s king is boxed in by its own pieces—find the knight square checking h8.',
      },
      ru: {
        title: 'Спёртый мат конём',
        prompt: 'Ход белых. Накажите чёрных спёртым матом, пользуясь теснотой короля.',
        hintText: 'Прыгните конём на f7.',
        correctExplanation:
          'Спёртый мат! Nf7# даёт неотразимый шах конём королю h8, окружённому собственными фигурами.',
        wrongHint: 'Чёрный король заперт своими фигурами — найдите шах конём по полю h8.',
      },
      zh: {
        title: '马的闷杀',
        prompt: '白方先走。利用黑王被己方棋子堵死的局面走出闷杀。',
        hintText: '将白马跳到 f7 格。',
        correctExplanation: '精彩的闷杀！Nf7# 给出无法遮挡的将军，黑王被自己的车和兵彻底封死。',
        wrongHint: '黑王周围没有空位，寻找白马直接将军 h8 的格子。',
      },
      fr: {
        title: 'Mat à l’étouffée du cavalier',
        prompt: 'Aux Blancs de jouer. Exploitez l’enfermement du roi noir pour le mat étouffé.',
        hintText: 'Sautez avec le cavalier en f7.',
        correctExplanation:
          'Mat à l’étouffée ! Nf7# donne un échec imparable au roi bloqué par sa propre tour et ses pions.',
        wrongHint: 'Le roi noir est enfermé par ses propres pièces ; cherchez l’échec de cavalier.',
      },
    },
  },

  // ==================== BACK RANK MATE (مات الصف الأخير) ====================
  {
    id: 'backRank-1',
    tactic: 'backRank',
    fen: '5k2/4ppp1/R7/8/8/8/5PPP/6K1 w - - 0 1',
    solutionUci: 'a6a8',
    solutionSan: 'Ra8#',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'مات الصف الأخير الكلاسيكي بالرخ',
        prompt: 'الأبيض يلعب. استغل عدم وجود متنفس لملك الأسود خلف بيادقه.',
        hintText: 'ارفع الرخ إلى الصف الثامن في a8.',
        correctExplanation:
          'كش مات في الصف الأخير! نقلة Ra8# تسيطر على الصف الثامن بالكامل، والبيادق f7 وg7 وe7 تغلق طريق الهروب أمام الملك.',
        wrongHint: 'انظر إلى الصف الثامن المكشوف وغياب أي متنفس (Luft) للملك الأسود.',
      },
      en: {
        title: 'Classic Back-Rank Rook Mate',
        prompt: 'White to move. Exploit Black’s lack of king luft behind the pawns.',
        hintText: 'Send the rook all the way to the 8th rank on a8.',
        correctExplanation:
          'Back-rank checkmate! Ra8# sweeps the 8th rank while Black’s own pawns block any escape forward.',
        wrongHint: 'Notice the undefended 8th rank and the king trapped behind its pawns.',
      },
      ru: {
        title: 'Классический мат по последней горизонтали',
        prompt: 'Ход белых. Накажите отсутствие «форточки» у чёрного короля.',
        hintText: 'Поднимите ладью на 8-ю горизонталь — на поле a8.',
        correctExplanation:
          'Мат по последней горизонтали! Ra8# контролирует всю 8-ю линию, а собственные пешки запирают короля.',
        wrongHint: 'Обратите внимание на незащищённую 8-ю горизонталь за пешками.',
      },
      zh: {
        title: '经典底线车杀',
        prompt: '白方先走。抓住黑王没有开出“透气孔”的弱点，一举底线将死。',
        hintText: '将白车直捣第八横线 a8 格。',
        correctExplanation: '经典底线杀！Ra8# 控制整条底线，而黑方自己的兵挡住了黑王前进的道路。',
        wrongHint: '注意黑方第八横线空虚且黑王被己方兵堵住。',
      },
      fr: {
        title: 'Mat du couloir classique par la tour',
        prompt: 'Aux Blancs de jouer. Punissez le roi noir coincé sans case de fuite.',
        hintText: 'Montez la tour sur la 8e rangée en a8.',
        correctExplanation:
          'Mat du couloir ! Ra8# contrôle toute la 8e rangée pendant que les pions noirs bloquent le roi.',
        wrongHint: 'La 8e rangée est sans défense et le roi n’a aucun dégagement devant ses pions.',
      },
    },
  },
  {
    id: 'backRank-2',
    tactic: 'backRank',
    fen: '6k1/5ppp/8/8/8/8/4QPPP/6K1 w - - 0 1',
    solutionUci: 'e2e8',
    solutionSan: 'Qe8#',
    targetSideLabel: 'w',
    localized: {
      ar: {
        title: 'مات الصف الأخير بالوزير',
        prompt: 'الأبيض يلعب. انقض بالوزير على الصف الثامن لإنهاء المباراة فوراً.',
        hintText: 'ادفع الوزير من e2 مباشرة إلى e8.',
        correctExplanation:
          'كش مات سريع! نقلة Qe8# تغلق الصف الثامن بالكامل أمام الملك المحبوس خلف بيادق التحصين.',
        wrongHint: 'عمود e مفتوح بالكامل نحو الصف الثامن؛ اضرب الصف الأخير مباشرة.',
      },
      en: {
        title: 'Back-Rank Queen Strike',
        prompt: 'White to move. Invade the 8th rank with your queen to finish the game.',
        hintText: 'Launch the queen straight up the open file from e2 to e8.',
        correctExplanation:
          'Instant checkmate! Qe8# dominates the back rank with Black’s king trapped behind the f7–h7 pawn shield.',
        wrongHint: 'The e-file leads straight to the unprotected back rank—strike immediately.',
      },
      ru: {
        title: 'Удар ферзём по последней горизонтали',
        prompt: 'Ход белых. Вторгнитесь ферзём на 8-ю горизонталь для немедленного мата.',
        hintText: 'Проведите ферзя по открытой вертикали с e2 на e8.',
        correctExplanation:
          'Быстрый мат! Qe8# полностью захватывает 8-ю горизонталь, а король заперт пешечным прикрытием.',
        wrongHint: 'Линия e полностью открыта до самого тыла чёрных — атакуйте 8-й ряд.',
      },
      zh: {
        title: '皇后底线突击',
        prompt: '白方先走。沿着开放线用皇后突入底线结束战斗。',
        hintText: '把白后直接从 e2 冲向底线 e8。',
        correctExplanation: '速胜将杀！Qe8# 彻底控制第八横线，黑王被自己的防线兵困死在底线。',
        wrongHint: 'e 线直通未设防的底线，果断进攻第八横线。',
      },
      fr: {
        title: 'Frappe de la dame sur la dernière rangée',
        prompt: 'Aux Blancs de jouer. Envahissez la 8e rangée avec la dame pour conclure.',
        hintText: 'Montez la dame directement de e2 à e8.',
        correctExplanation:
          'Mat immédiat ! Qe8# verrouille la 8e rangée alors que le roi noir reste bloqué par ses pions.',
        wrongHint: 'La colonne e est ouverte jusqu’à la 8e rangée sans défense.',
      },
    },
  },
  {
    id: 'backRank-3',
    tactic: 'backRank',
    fen: '6k1/5ppp/8/8/8/r7/4PPP1/5K2 b - - 0 1',
    solutionUci: 'a3a1',
    solutionSan: 'Ra1#',
    targetSideLabel: 'b',
    localized: {
      ar: {
        title: 'مات الصف الأول للأسود',
        prompt: 'الأسود يلعب. دورك الآن: عاقب الأبيض على إهمال حماية الصف الأول.',
        hintText: 'أنزل الرخ الأسود من a3 إلى المربع a1.',
        correctExplanation:
          'ضربة حاسمة بالأسود! نقلة Ra1# تنفذ مات الصف الأخير على الملك الأبيض المحاصر خلف بيادقه في e2 وf2 وg2.',
        wrongHint: 'الصف الأول للأبيض خالٍ من المدافعين والملك بلا متنفس؛ انزل بالرخ إلى الصف الأول.',
      },
      en: {
        title: 'Black’s 1st-Rank Strike',
        prompt: 'Black to move. Punish White for leaving the 1st rank unguarded.',
        hintText: 'Drop the Black rook from a3 down to a1.',
        correctExplanation:
          'Decisive back-rank strike! Ra1# delivers mate on the 1st rank with White’s king boxed in by its own pawns.',
        wrongHint: 'White’s 1st rank is empty and the king has no luft—drop your rook to the 1st rank.',
      },
      ru: {
        title: 'Ответный мат чёрных по 1-й линии',
        prompt: 'Ход чёрных. Накажите белых за незащищённую первую горизонталь.',
        hintText: 'Опустите чёрную ладью с a3 на a1.',
        correctExplanation:
          'Решающий удар! Ra1# ставит мат по 1-й горизонтали: белый король заперт собственными пешками.',
        wrongHint: 'Первая горизонталь белых открыта, а у короля нет форточки — опустите ладью.',
      },
      zh: {
        title: '黑方底线反杀',
        prompt: '黑方先走。惩罚白方底线空虚且王未出气孔的失误。',
        hintText: '将 a3 的黑车直接沉底至 a1。',
        correctExplanation: '干脆利落！Ra1# 在第一横线将死白王，白王被自己的兵挡得严严实实。',
        wrongHint: '白方底线无人防守且白王无路可退，直接沉车到底线。',
      },
      fr: {
        title: 'Mat du couloir pour les Noirs',
        prompt: 'Aux Noirs de jouer. Punissez les Blancs d’avoir laissé la 1re rangée sans garde.',
        hintText: 'Descendez la tour noire de a3 en a1.',
        correctExplanation:
          'Frappe décisive ! Ra1# inflige le mat du couloir sur la 1re rangée au roi blanc enfermé.',
        wrongHint: 'La 1re rangée blanche est vide et le roi n’a pas d’air ; descendez la tour.',
      },
    },
  },
];
