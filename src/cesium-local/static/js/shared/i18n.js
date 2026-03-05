/**
 * i18n – lightweight translation module for SUNSCOPE.
 * Uses data-i18n attributes on elements to swap text.
 * Usage: <span data-i18n="nav.workspace">Workspace</span>
 */
(function () {
  const STRINGS = {
    en: {
      // ── Navigation ──
      'nav.workspace': 'Workspace',
      'nav.analysis': 'Analysis',
      'top.lang': 'LANG',
      'top.currency': 'CURRENCY',
      'top.login': 'Login',
      'top.logout': 'Logout',

      // ── Login page ──
      'login.title': 'Operator Login',
      'login.tag': 'Revision 2.6',
      'login.operator_id': 'Operator ID',
      'login.operator_id_ph': 'Email or username',
      'login.access_key': 'Access Key',
      'login.access_key_ph': 'Enter password',
      'login.submit': 'Engage Session',
      'login.footer': 'Need credentials?',
      'login.footer_link': 'Create an account',
      'login.status_system': 'System: Nominal',
      'login.status_console': 'Console: SOLAR-ROI / v2.6',
      'login.status_security': 'Security: Active',

      // ── Register page ──
      'reg.title': 'Create Operator Profile',
      'reg.tag': 'Revision 2.6',
      'reg.name': 'Operator Name',
      'reg.name_ph': 'Full name',
      'reg.email': 'Email Address',
      'reg.email_ph': 'name@email.com',
      'reg.password': 'Access Key',
      'reg.password_ph': 'Min. 6 characters',
      'reg.confirm': 'Confirm Access Key',
      'reg.confirm_ph': 'Repeat password',
      'reg.submit': 'Provision Profile',
      'reg.footer': 'Already registered?',
      'reg.footer_link': 'Sign in',

      // ── App page ──
      'app.search_ph': 'Enter an address or place',
      'app.search_btn': 'Search',
      'app.detect_btn': 'Detect',
      'app.project': 'Project',
      'app.save_popup': 'Project Saved',
      'app.sketch_mode': 'SKETCH MODE',
      'app.undo': 'Undo (Ctrl+Z)',
      'app.redo': 'Redo (Ctrl+Shift+Z)',
      'app.finish_sketch': 'Finish sketch',
      'app.cancel_sketch': 'Cancel sketch',

      // ── Command bar ──
      'cmd.tree': 'Manager Tree',
      'cmd.user': 'User Information',
      'cmd.inverter': 'Inverter',
      'cmd.battery': 'Battery',
      'cmd.open': 'Open Project',
      'cmd.save': 'Save Project',

      // ── Project detail ──
      'detail.appliances': 'Appliances',
      'detail.add_preset': 'Add Preset Appliance',
      'detail.select': '-- Select --',
      'detail.add_btn': 'Add',
      'detail.elec_price': 'Electricity Price',
      'detail.price_kwh': 'Price per kWh',
      'detail.export_price': 'Grid Export Price',
      'detail.export_kwh': 'Export price per kWh',
      'detail.export_hint': 'Price your utility pays for exported solar energy.',
      'detail.project_name': 'Project Name',
      'detail.project_name_ph': 'My Solar Project',
      'detail.search_inv': 'Search Inverter',
      'detail.search_inv_ph': 'Search brand, model, kW...',
      'detail.installed_inv': 'Installed Inverters',
      'detail.search_bat': 'Search Battery',
      'detail.search_bat_ph': 'Search brand, model, kWh...',
      'detail.installed_bat': 'Installed Batteries',

      // ── Calculate page ──
      'calc.projects': 'Projects',
      'calc.loading': 'Loading projects...',
      'calc.estimate': 'Estimate System',
      'calc.delete': 'Delete',
      'calc.no_selection': 'No selection',
      'calc.actual_roof': 'ACTUAL ROOF',
      'calc.model_3d': '3D MODEL',
      'calc.irradiation': 'Monthly Solar Irradiation',
      'calc.pv_output': 'Monthly PV Output (Total System)',
      'calc.system_size': 'System Size',
      'calc.annual_pv': 'Annual PV',
      'calc.bom': 'Bill of Materials',
      'calc.roi_report': 'ROI Report',
      'calc.energy_balance': 'Monthly Energy Balance',
      'calc.cashflow': 'Cumulative Cashflow',
      'calc.bill_compare': 'Monthly Bill Comparison',
      'calc.self_consume': 'Self‑Consumption Ratio',

      // ── Open Project Modal ──
      'modal.open_project': 'Open Project',
    },

    th: {
      'nav.workspace': 'พื้นที่ทำงาน',
      'nav.analysis': 'วิเคราะห์',
      'top.lang': 'ภาษา',
      'top.currency': 'สกุลเงิน',
      'top.login': 'เข้าสู่ระบบ',
      'top.logout': 'ออกจากระบบ',

      'login.title': 'เข้าสู่ระบบผู้ดูแล',
      'login.tag': 'เวอร์ชัน 2.6',
      'login.operator_id': 'ชื่อผู้ใช้',
      'login.operator_id_ph': 'อีเมลหรือชื่อผู้ใช้',
      'login.access_key': 'รหัสผ่าน',
      'login.access_key_ph': 'ใส่รหัสผ่าน',
      'login.submit': 'เริ่มเซสชัน',
      'login.footer': 'ยังไม่มีบัญชี?',
      'login.footer_link': 'สร้างบัญชี',
      'login.status_system': 'ระบบ: ปกติ',
      'login.status_console': 'คอนโซล: SOLAR-ROI / v2.6',
      'login.status_security': 'ความปลอดภัย: เปิดใช้งาน',

      'reg.title': 'สร้างโปรไฟล์ผู้ดูแล',
      'reg.tag': 'เวอร์ชัน 2.6',
      'reg.name': 'ชื่อผู้ดูแล',
      'reg.name_ph': 'ชื่อเต็ม',
      'reg.email': 'อีเมล',
      'reg.email_ph': 'name@email.com',
      'reg.password': 'รหัสผ่าน',
      'reg.password_ph': 'อย่างน้อย 6 ตัวอักษร',
      'reg.confirm': 'ยืนยันรหัสผ่าน',
      'reg.confirm_ph': 'ใส่รหัสผ่านอีกครั้ง',
      'reg.submit': 'สร้างโปรไฟล์',
      'reg.footer': 'มีบัญชีแล้ว?',
      'reg.footer_link': 'เข้าสู่ระบบ',

      'app.search_ph': 'ค้นหาที่อยู่หรือสถานที่',
      'app.search_btn': 'ค้นหา',
      'app.detect_btn': 'ตรวจจับ',
      'app.project': 'โปรเจกต์',
      'app.save_popup': 'บันทึกโปรเจกต์แล้ว',
      'app.sketch_mode': 'โหมดวาด',
      'app.undo': 'เลิกทำ (Ctrl+Z)',
      'app.redo': 'ทำซ้ำ (Ctrl+Shift+Z)',
      'app.finish_sketch': 'วาดเสร็จ',
      'app.cancel_sketch': 'ยกเลิกการวาด',

      'cmd.tree': 'แผนผังโปรเจกต์',
      'cmd.user': 'ข้อมูลผู้ใช้',
      'cmd.inverter': 'อินเวอร์เตอร์',
      'cmd.battery': 'แบตเตอรี่',
      'cmd.open': 'เปิดโปรเจกต์',
      'cmd.save': 'บันทึกโปรเจกต์',

      'detail.appliances': 'เครื่องใช้ไฟฟ้า',
      'detail.add_preset': 'เพิ่มเครื่องใช้ไฟฟ้า',
      'detail.select': '-- เลือก --',
      'detail.add_btn': 'เพิ่ม',
      'detail.elec_price': 'ค่าไฟฟ้า',
      'detail.price_kwh': 'ราคาต่อ kWh',
      'detail.export_price': 'ราคาขายไฟฟ้า',
      'detail.export_kwh': 'ราคาส่งออกต่อ kWh',
      'detail.export_hint': 'ราคาที่การไฟฟ้ารับซื้อไฟฟ้าส่วนเกิน',
      'detail.project_name': 'ชื่อโปรเจกต์',
      'detail.project_name_ph': 'โปรเจกต์พลังงานแสงอาทิตย์',
      'detail.search_inv': 'ค้นหาอินเวอร์เตอร์',
      'detail.search_inv_ph': 'ค้นหายี่ห้อ, รุ่น, kW...',
      'detail.installed_inv': 'อินเวอร์เตอร์ที่ติดตั้ง',
      'detail.search_bat': 'ค้นหาแบตเตอรี่',
      'detail.search_bat_ph': 'ค้นหายี่ห้อ, รุ่น, kWh...',
      'detail.installed_bat': 'แบตเตอรี่ที่ติดตั้ง',

      'calc.projects': 'โปรเจกต์',
      'calc.loading': 'กำลังโหลดโปรเจกต์...',
      'calc.estimate': 'ประเมินระบบ',
      'calc.delete': 'ลบ',
      'calc.no_selection': 'ยังไม่เลือก',
      'calc.actual_roof': 'หลังคาจริง',
      'calc.model_3d': 'โมเดล 3 มิติ',
      'calc.irradiation': 'ปริมาณแสงอาทิตย์รายเดือน',
      'calc.pv_output': 'กำลังผลิตไฟฟ้ารายเดือน (ระบบรวม)',
      'calc.system_size': 'ขนาดระบบ',
      'calc.annual_pv': 'ผลิตไฟฟ้ารายปี',
      'calc.bom': 'รายการวัสดุ',
      'calc.roi_report': 'รายงาน ROI',
      'calc.energy_balance': 'สมดุลพลังงานรายเดือน',
      'calc.cashflow': 'กระแสเงินสดสะสม',
      'calc.bill_compare': 'เปรียบเทียบค่าไฟรายเดือน',
      'calc.self_consume': 'อัตราใช้ไฟเอง',

      'modal.open_project': 'เปิดโปรเจกต์',
    },

    ja: {
      'nav.workspace': 'ワークスペース',
      'nav.analysis': '分析',
      'top.lang': '言語',
      'top.currency': '通貨',
      'top.login': 'ログイン',
      'top.logout': 'ログアウト',

      'login.title': 'オペレータログイン',
      'login.tag': 'リビジョン 2.6',
      'login.operator_id': 'オペレータID',
      'login.operator_id_ph': 'メールまたはユーザー名',
      'login.access_key': 'パスワード',
      'login.access_key_ph': 'パスワードを入力',
      'login.submit': 'セッション開始',
      'login.footer': 'アカウントが必要ですか？',
      'login.footer_link': 'アカウント作成',
      'login.status_system': 'システム: 正常',
      'login.status_console': 'コンソール: SOLAR-ROI / v2.6',
      'login.status_security': 'セキュリティ: 有効',

      'reg.title': 'オペレータプロファイル作成',
      'reg.tag': 'リビジョン 2.6',
      'reg.name': 'オペレータ名',
      'reg.name_ph': '氏名',
      'reg.email': 'メールアドレス',
      'reg.email_ph': 'name@email.com',
      'reg.password': 'パスワード',
      'reg.password_ph': '6文字以上',
      'reg.confirm': 'パスワード確認',
      'reg.confirm_ph': 'パスワードを再入力',
      'reg.submit': 'プロファイル作成',
      'reg.footer': '登録済みですか？',
      'reg.footer_link': 'サインイン',

      'app.search_ph': '住所または場所を入力',
      'app.search_btn': '検索',
      'app.detect_btn': '検出',
      'app.project': 'プロジェクト',
      'app.save_popup': 'プロジェクト保存済み',
      'app.sketch_mode': 'スケッチモード',
      'app.undo': '元に戻す (Ctrl+Z)',
      'app.redo': 'やり直し (Ctrl+Shift+Z)',
      'app.finish_sketch': 'スケッチ完了',
      'app.cancel_sketch': 'スケッチ取消',

      'cmd.tree': 'プロジェクトツリー',
      'cmd.user': 'ユーザー情報',
      'cmd.inverter': 'インバーター',
      'cmd.battery': 'バッテリー',
      'cmd.open': 'プロジェクトを開く',
      'cmd.save': 'プロジェクト保存',

      'detail.appliances': '家電製品',
      'detail.add_preset': 'プリセット追加',
      'detail.select': '-- 選択 --',
      'detail.add_btn': '追加',
      'detail.elec_price': '電気料金',
      'detail.price_kwh': 'kWh単価',
      'detail.export_price': '売電価格',
      'detail.export_kwh': '売電kWh単価',
      'detail.export_hint': '余剰電力の買取価格',
      'detail.project_name': 'プロジェクト名',
      'detail.project_name_ph': 'ソーラープロジェクト',
      'detail.search_inv': 'インバーター検索',
      'detail.search_inv_ph': 'ブランド、モデル、kW...',
      'detail.installed_inv': '設置済みインバーター',
      'detail.search_bat': 'バッテリー検索',
      'detail.search_bat_ph': 'ブランド、モデル、kWh...',
      'detail.installed_bat': '設置済みバッテリー',

      'calc.projects': 'プロジェクト',
      'calc.loading': 'プロジェクト読込中...',
      'calc.estimate': 'システム見積',
      'calc.delete': '削除',
      'calc.no_selection': '未選択',
      'calc.actual_roof': '実際の屋根',
      'calc.model_3d': '3Dモデル',
      'calc.irradiation': '月別日射量',
      'calc.pv_output': '月別PV出力（システム合計）',
      'calc.system_size': 'システム容量',
      'calc.annual_pv': '年間PV発電量',
      'calc.bom': '部品表',
      'calc.roi_report': 'ROIレポート',
      'calc.energy_balance': '月別エネルギー収支',
      'calc.cashflow': '累積キャッシュフロー',
      'calc.bill_compare': '月別電気料金比較',
      'calc.self_consume': '自家消費率',

      'modal.open_project': 'プロジェクトを開く',
    }
  };

  let _lang = localStorage.getItem('sunscope_lang') || 'en';

  function t(key) {
    const dict = STRINGS[_lang] || STRINGS.en;
    return dict[key] || (STRINGS.en[key] || key);
  }

  function applyTranslations() {
    // Text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    // Placeholders
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const key = el.getAttribute('data-i18n-ph');
      el.placeholder = t(key);
    });
    // Titles / aria-labels
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = t(key);
    });
    // Set html lang
    document.documentElement.lang = _lang;
  }

  function setLang(code) {
    if (!STRINGS[code]) return;
    _lang = code;
    localStorage.setItem('sunscope_lang', code);
    applyTranslations();
  }

  function getLang() { return _lang; }

  // Auto-apply on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTranslations);
  } else {
    applyTranslations();
  }

  // Listen for lang-changed event
  window.addEventListener('lang-changed', (e) => {
    const lang = e.detail && e.detail.lang;
    if (lang) setLang(lang);
  });

  window.I18n = { t, setLang, getLang, apply: applyTranslations, STRINGS };
})();
