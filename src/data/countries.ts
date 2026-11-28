import type { SupportedLanguage } from '../i18n/translations.ts';

export interface CountryOption {
  code: string;
  flag: string;
  names: Record<SupportedLanguage, string>;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  {
    code: 'DZ',
    flag: '🇩🇿',
    names: { ar: 'الجزائر', en: 'Algeria', ru: 'Алжир', zh: '阿尔及利亚', fr: 'Algérie' },
  },
  {
    code: 'SA',
    flag: '🇸🇦',
    names: { ar: 'السعودية', en: 'Saudi Arabia', ru: 'Саудовская Аравия', zh: '沙特阿拉伯', fr: 'Arabie saoudite' },
  },
  {
    code: 'EG',
    flag: '🇪🇬',
    names: { ar: 'مصر', en: 'Egypt', ru: 'Египет', zh: '埃及', fr: 'Égypte' },
  },
  {
    code: 'MA',
    flag: '🇲🇦',
    names: { ar: 'المغرب', en: 'Morocco', ru: 'Марокко', zh: '摩洛哥', fr: 'Maroc' },
  },
  {
    code: 'TN',
    flag: '🇹🇳',
    names: { ar: 'تونس', en: 'Tunisia', ru: 'Тунис', zh: '突尼斯', fr: 'Tunisie' },
  },
  {
    code: 'AE',
    flag: '🇦🇪',
    names: { ar: 'الإمارات', en: 'UAE', ru: 'ОАЭ', zh: '阿联酋', fr: 'Émirats arabes unis' },
  },
  {
    code: 'QA',
    flag: '🇶🇦',
    names: { ar: 'قطر', en: 'Qatar', ru: 'Катар', zh: '卡塔尔', fr: 'Qatar' },
  },
  {
    code: 'KW',
    flag: '🇰🇼',
    names: { ar: 'الكويت', en: 'Kuwait', ru: 'Кувейт', zh: '科威特', fr: 'Koweït' },
  },
  {
    code: 'JO',
    flag: '🇯🇴',
    names: { ar: 'الأردن', en: 'Jordan', ru: 'Иордания', zh: '约旦', fr: 'Jordanie' },
  },
  {
    code: 'IQ',
    flag: '🇮🇶',
    names: { ar: 'العراق', en: 'Iraq', ru: 'Ирак', zh: '伊拉克', fr: 'Irak' },
  },
  {
    code: 'LB',
    flag: '🇱🇧',
    names: { ar: 'لبنان', en: 'Lebanon', ru: 'Ливан', zh: '黎巴嫩', fr: 'Liban' },
  },
  {
    code: 'US',
    flag: '🇺🇸',
    names: { ar: 'الولايات المتحدة', en: 'United States', ru: 'США', zh: '美国', fr: 'États-Unis' },
  },
  {
    code: 'GB',
    flag: '🇬🇧',
    names: { ar: 'المملكة المتحدة', en: 'United Kingdom', ru: 'Великобритания', zh: '英国', fr: 'Royaume-Uni' },
  },
  {
    code: 'FR',
    flag: '🇫🇷',
    names: { ar: 'فرنسا', en: 'France', ru: 'Франция', zh: '法国', fr: 'France' },
  },
  {
    code: 'DE',
    flag: '🇩🇪',
    names: { ar: 'ألمانيا', en: 'Germany', ru: 'Германия', zh: '德国', fr: 'Allemagne' },
  },
  {
    code: 'ES',
    flag: '🇪🇸',
    names: { ar: 'إسبانيا', en: 'Spain', ru: 'Испания', zh: '西班牙', fr: 'Espagne' },
  },
  {
    code: 'IT',
    flag: '🇮🇹',
    names: { ar: 'إيطاليا', en: 'Italy', ru: 'Италия', zh: '意大利', fr: 'Italie' },
  },
  {
    code: 'RU',
    flag: '🇷🇺',
    names: { ar: 'روسيا', en: 'Russia', ru: 'Россия', zh: '俄罗斯', fr: 'Russie' },
  },
  {
    code: 'CN',
    flag: '🇨🇳',
    names: { ar: 'الصين', en: 'China', ru: 'Китай', zh: '中国', fr: 'Chine' },
  },
  {
    code: 'IN',
    flag: '🇮🇳',
    names: { ar: 'الهند', en: 'India', ru: 'Индия', zh: '印度', fr: 'Inde' },
  },
  {
    code: 'TR',
    flag: '🇹🇷',
    names: { ar: 'تركيا', en: 'Turkey', ru: 'Турция', zh: '土耳其', fr: 'Turquie' },
  },
  {
    code: 'BR',
    flag: '🇧🇷',
    names: { ar: 'البرازيل', en: 'Brazil', ru: 'Бразилия', zh: '巴西', fr: 'Brésil' },
  },
  {
    code: 'CA',
    flag: '🇨🇦',
    names: { ar: 'كندا', en: 'Canada', ru: 'Канада', zh: '加拿大', fr: 'Canada' },
  },
  {
    code: 'NO',
    flag: '🇳🇴',
    names: { ar: 'النرويج', en: 'Norway', ru: 'Норвегия', zh: '挪威', fr: 'Norvège' },
  },
  {
    code: 'UZ',
    flag: '🇺🇿',
    names: { ar: 'أوزبكستان', en: 'Uzbekistan', ru: 'Узбекистан', zh: '乌兹别克斯坦', fr: 'Ouzbékistan' },
  },
  {
    code: 'JP',
    flag: '🇯🇵',
    names: { ar: 'اليابان', en: 'Japan', ru: 'Япония', zh: '日本', fr: 'Japon' },
  },
  {
    code: 'INTL',
    flag: '🌐',
    names: { ar: 'دولي', en: 'International', ru: 'Международный', zh: '国际', fr: 'International' },
  },
];

export function getCountryByCode(code: string | undefined | null): CountryOption {
  const normalized = (code ?? '').trim().toUpperCase();
  return (
    COUNTRY_OPTIONS.find((c) => c.code === normalized) ??
    COUNTRY_OPTIONS[COUNTRY_OPTIONS.length - 1]
  );
}
