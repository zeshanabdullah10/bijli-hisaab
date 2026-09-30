// Bilingual strings. Technical terms keep their bill-day English spellings in
// Urdu (e.g. ایف پی اے) because that is how they appear on the paper bill.

export const STRINGS = {
  en: {
    brand: 'BijliHisaab',
    tagline: 'Your electricity bill, translated.',
    rates_chip: 'Rates in force since {date} · LESCO domestic · FPA changes monthly, enter yours from the bill',
    lang_toggle: 'اردو',
    theme_toggle: 'Toggle appearance',
    less_units: 'Fewer units',
    more_units: 'More units',

    units_label: 'Monthly units',
    consumer_type: 'Consumer type',
    type_unprotected: 'Unprotected',
    type_protected: 'Protected',
    type_lifeline: 'Lifeline',
    load_label: 'Sanctioned load (kW)',
    fpa_label: 'FPA (Rs/unit)',
    fpa_hint: 'Bills print the exact FPA rate. Leave empty to use the latest documented value.',
    filer_label: 'Tax filer (ATL)',
    filer_hint: 'Non-filers pay 7.5% income tax once the bill reaches Rs 25,000.',
    budget_label: 'My budget (Rs)',
    actual_bill_label: 'Actual bill (Rs)',

    total_label: 'Estimated total',
    effective_rate: 'Effective rate',
    per_unit: '/unit',
    breakdown_title: 'Your bill, line by line',
    breakdown_hint: 'tap a line',
    how_computed: 'How this line is calculated',
    source: 'Source',
    cluster_energy: 'Electricity',
    cluster_taxes: 'Taxes & fees',
    cluster_subtotal: 'Subtotal',

    cliff_title: 'The slab cliff',
    cliff_current_slab: 'Current slab',
    cliff_remaining: 'Units left',
    cliff_crossing: 'Cost of crossing',
    cliff_next_unit: 'One more unit',
    cliff_note: 'Unprotected consumers: every unit is billed at the rate of the slab the month lands in. Cross a boundary and the whole month is repriced.',
    cliff_top: 'Top slab, no cliff above you.',
    chart_hint: 'Drag the chart to explore',

    budget_title: 'Budget planner',
    budget_result: 'You can use up to {units} units',
    budget_too_small: 'Even the standing charges exceed this budget.',

    audit_title: 'Audit your paper bill',
    audit_computed: 'Computed',
    audit_actual: 'Your bill says',
    audit_diff: 'Difference',
    audit_close: 'Within a few percent, consistent with the tariff.',
    audit_explain_title: 'If the gap is bigger, the usual suspects:',
    audit_e1: 'FPA differs month to month and is billed about 2 months late. Set the exact rate from your bill.',
    audit_e2: 'Arrears, meter rent, municipal taxes and estimated readings are not modelled.',
    audit_e3: 'Sanctioned load drives the fixed charge. Confirm it matches your bill.',
    audit_file: 'Complain to NEPRA',
    audit_helpline: 'LESCO helpline',

    share_btn: 'Copy WhatsApp summary',
    copied: 'Copied!',
    share_text: 'BijliHisaab: {units} units ≈ Rs {total} ({type}, {slab} slab). Effective Rs {rate}/unit. Crossing to {next} units would cost Rs {cross} extra. Know your bill.',

    disclaimer: 'Estimates only. A real bill can differ by a few percent (arrears, meter rent, municipal taxes and estimated readings are not modelled). Rates are updated from official notifications, always verify against your paper bill.',
    data_updated: 'Data verified on {date}',
    footer_sources: 'Tariff sources',
    offline_ready: 'Works offline',
  },

  ur: {
    brand: 'بجلی حساب',
    tagline: 'آپ کا بجلی بل، آسان زبان میں۔',
    rates_chip: 'تاریخ {date} سے لاگو نرخ · لیسکو گھریلو · ایف پی اے ہر مہینے بدلتا ہے، اپنے بل والا درج کریں',
    lang_toggle: 'English',
    theme_toggle: 'ظہور بدلیں',
    less_units: 'یونٹس کم کریں',
    more_units: 'یونٹس بڑھائیں',

    units_label: 'ماہانہ یونٹس',
    consumer_type: 'صارف کی قسم',
    type_unprotected: 'غیر محفوظ',
    type_protected: 'محفوظ',
    type_lifeline: 'لائف لائن',
    load_label: 'منظور شدہ لوڈ (kW)',
    fpa_label: 'ایف پی اے (روپے فی یونٹ)',
    fpa_hint: 'بل پر ایف پی اے کی درست شرح لکھی ہوتی ہے۔ خالی چھوڑیں تو دستاویزی اوسط استعمال ہوگا۔',
    filer_label: 'ٹیکس فائلر (اے ٹی ایل)',
    filer_hint: 'نان فائلرز کے لیے 25,000 روپے سے اوپر کے بل پر 7.5٪ انکم ٹیکس لگتا ہے۔',
    budget_label: 'میرا بجٹ (روپے)',
    actual_bill_label: 'اصل بل (روپے)',

    total_label: 'تخمینی کل',
    effective_rate: 'مؤثر شرح',
    per_unit: 'فی یونٹ',
    breakdown_title: 'آپ کا بل، سطر بہ سطر',
    breakdown_hint: 'سطر پر ٹیپ کریں',
    how_computed: 'یہ سطر کیسے نکلی',
    source: 'ماخذ',
    cluster_energy: 'بجلی',
    cluster_taxes: 'ٹیکس اور فیس',
    cluster_subtotal: 'ذیلی کل',

    cliff_title: 'سلیب کی کھائی',
    cliff_current_slab: 'موجودہ سلیب',
    cliff_remaining: 'باقی یونٹس',
    cliff_crossing: 'پار کرنے کا خرچ',
    cliff_next_unit: 'ایک اضافی یونٹ',
    cliff_note: 'غیر محفوظ صارفین کی پوری کھپت اُس سلیب کی شرح پر بل ہوتی ہے جس میں مہینہ جمع ہو۔ سرحد پار ہوتے ہی پورا مہینہ دوبارہ مہنگا ہو جاتا ہے۔',
    cliff_top: 'سب سے اوپری سلیب، اوپر کوئی کھائی نہیں۔',
    chart_hint: 'چارٹ گھسیٹ کر دیکھیں',

    budget_title: 'بجٹ پلانر',
    budget_result: 'آپ زیادہ سے زیادہ {units} یونٹس استعمال کر سکتے ہیں',
    budget_too_small: 'اتنا بجٹ کھڑے چارجز سے بھی کم ہے۔',

    audit_title: 'اپنے بل کی جانچ',
    audit_computed: 'حساب شدہ',
    audit_actual: 'آپ کے بل پر',
    audit_diff: 'فرق',
    audit_close: 'چند فیصد کے فرق کے اندر، نرخوں کے مطابق ہے۔',
    audit_explain_title: 'اگر فرق بڑا ہو تو عام وجوہات:',
    audit_e1: 'ایف پی اے مہینے بدل بدلتا ہے اور تقریباً دو مہینے تاخیر سے لگتا ہے، اپنے بل والی شرح درج کریں۔',
    audit_e2: 'بقایاجات، میٹر کرایہ، میونسپل ٹیکس اور اندازتی ریڈنگ شامل نہیں۔',
    audit_e3: 'ثابت چارج منظور شدہ لوڈ سے نکلتا ہے، اپنے بل سے ملانا یقینی کریں۔',
    audit_file: 'نیپرا میں شکایت کریں',
    audit_helpline: 'لیسکو ہیلپ لائن',

    share_btn: 'واٹس ایپ خلاصہ کاپی کریں',
    copied: 'کاپی ہو گیا!',
    share_text: 'بجلی حساب: {units} یونٹس تقریباً {total} روپے ({type}، {slab} سلیب)۔ مؤثر شرح {rate} روپے فی یونٹ۔ اگلی سرحد پر {next} یونٹس سے کل میں {cross} روپے اضافہ ہوگا۔ اپنا بل سمجھیں۔',

    disclaimer: 'یہ صرف تخمینہ ہے، اصل بل سے چند فیصد فرق عام ہے (بقایاجات، میٹر کرایہ، میونسپل ٹیکس اور اندازتی ریڈنگ شامل نہیں)۔ نرخ سرکاری نوٹیفکیشنز سے اپڈیٹ ہوتے ہیں، تصدیق کے لیے اپنا بل دیکھیں۔',
    data_updated: 'ڈیٹا کی تصدیق: {date}',
    footer_sources: 'نرخوں کے ماخذ',
    offline_ready: 'بغیر انٹرنیٹ بھی چلتا ہے',
  },
};

export function makeT(lang) {
  return (key, params = {}) => {
    let s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
    return s;
  };
}

export const fmt = (n) => new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(Math.round(n));
export const fmt2 = (n) => new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
