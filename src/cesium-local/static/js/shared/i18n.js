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

      // ── Catalog Filters ──
      'filter.brand': 'Brand',
      'filter.phase': 'Phase',
      'filter.kw_range': 'kW Range',
      'filter.kwh_range': 'kWh Range',
      'filter.recommend': 'Recommend Inverter',
      'filter.recommend_bat': 'Recommend Battery',

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

      // ── App extras ──
      'app.close': 'Close',

      // ── Calculate – table headers ──
      'calc.th_roof': 'Roof',
      'calc.th_tilt': 'Tilt (°)',
      'calc.th_azimuth': 'Azimuth (°)',
      'calc.th_area': 'Area (m²)',
      'calc.th_irradiation': 'Irradiation (kWh/m²/y)',
      'calc.th_topic': 'Topic',
      'calc.th_description': 'Description',
      'calc.th_quantity': 'Quantity',
      'calc.th_unit': 'Unit',
      'calc.th_item': 'Item',
      'calc.th_qty': 'Qty',
      'calc.th_spec': 'Spec',
      'calc.th_unit_cost': 'Unit Cost',
      'calc.th_total': 'Total',

      // ── Calculate – dynamic text ──
      'calc.loading_irr': 'Loading irradiation data from PVGIS...',
      'calc.loading_pv': 'Calculating PV output...',
      'calc.select_prompt': 'Select a project and calculate sizing to generate the report.',
      'calc.not_logged_in': 'Not Logged In',
      'calc.login_prompt': 'to view your projects.',
      'calc.no_projects': 'No Projects',
      'calc.create_prompt': 'Create a project in the App first.',
      'calc.created': 'Created',
      'calc.location': 'Location',
      'calc.roofs_label': 'Roofs',
      'calc.selected_prefix': 'Selected',

      // ── Report rows ──
      'calc.self_consumption': 'Self\u2011Consumption',
      'calc.annual_savings': 'Annual Savings',
      'calc.payback': 'Payback',
      'calc.npv_label': 'NPV',
      'calc.irr_label': 'IRR',
      'calc.total_capex': 'Total Capex',
      'calc.lcoe': 'LCOE',
      'calc.desc_self': 'PV used onsite',
      'calc.desc_savings': 'Baseline bill minus post\u2011PV bill',
      'calc.desc_payback': 'Years to recover total capex',
      'calc.desc_npv': 'Net present value of cashflows',
      'calc.desc_irr': 'Rate where NPV equals zero',
      'calc.desc_capex': 'Hardware + BOS/installation',
      'calc.desc_lcoe': 'Levelized cost of PV energy',
      'calc.panel': 'Panel',
      'calc.hw_total': 'Hardware Total',
      'calc.capex_bos': 'Total Capex (incl. BOS)',

      // ── Chart labels ──
      'calc.chart_load': 'Load',
      'calc.chart_self_consumed': 'Self-consumed',
      'calc.chart_export': 'Export',
      'calc.chart_baseline': 'Baseline Bill',
      'calc.chart_post_pv': 'Post\u2011PV Bill',
      'calc.chart_pv_output': 'PV Output (kWh)',
      'calc.chart_self_kwh': 'Self-Consumed [kWh]',
      'calc.chart_export_kwh': 'Exported [kWh]',
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

      'filter.brand': 'ยี่ห้อ',
      'filter.phase': 'เฟส',
      'filter.kw_range': 'ช่วง kW',
      'filter.kwh_range': 'ช่วง kWh',
      'filter.recommend': 'แนะนำอินเวอร์เตอร์',
      'filter.recommend_bat': 'แนะนำแบตเตอรี่',

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

      'app.close': 'ปิด',

      'calc.th_roof': 'หลังคา',
      'calc.th_tilt': 'มุมเอียง (°)',
      'calc.th_azimuth': 'ทิศ (°)',
      'calc.th_area': 'พื้นที่ (m²)',
      'calc.th_irradiation': 'แสงอาทิตย์ (kWh/m²/ปี)',
      'calc.th_topic': 'หัวข้อ',
      'calc.th_description': 'คำอธิบาย',
      'calc.th_quantity': 'จำนวน',
      'calc.th_unit': 'หน่วย',
      'calc.th_item': 'รายการ',
      'calc.th_qty': 'จำนวน',
      'calc.th_spec': 'สเปก',
      'calc.th_unit_cost': 'ราคาต่อหน่วย',
      'calc.th_total': 'รวม',

      'calc.loading_irr': 'กำลังโหลดข้อมูลแสงอาทิตย์จาก PVGIS...',
      'calc.loading_pv': 'กำลังคำนวณผลิตไฟฟ้า...',
      'calc.select_prompt': 'เลือกโปรเจกต์และคำนวณขนาดระบบเพื่อสร้างรายงาน',
      'calc.not_logged_in': 'ยังไม่เข้าสู่ระบบ',
      'calc.login_prompt': 'เพื่อดูโปรเจกต์ของคุณ',
      'calc.no_projects': 'ไม่มีโปรเจกต์',
      'calc.create_prompt': 'สร้างโปรเจกต์ในพื้นที่ทำงานก่อน',
      'calc.created': 'สร้างเมื่อ',
      'calc.location': 'ตำแหน่ง',
      'calc.roofs_label': 'หลังคา',
      'calc.selected_prefix': 'เลือก',

      'calc.self_consumption': 'ใช้ไฟเอง',
      'calc.annual_savings': 'ประหยัดต่อปี',
      'calc.payback': 'คืนทุน',
      'calc.npv_label': 'NPV',
      'calc.irr_label': 'IRR',
      'calc.total_capex': 'ลงทุนรวม',
      'calc.lcoe': 'LCOE',
      'calc.desc_self': 'ไฟฟ้า PV ใช้เอง',
      'calc.desc_savings': 'ค่าไฟก่อนลบหลัง PV',
      'calc.desc_payback': 'ปีที่คืนทุน',
      'calc.desc_npv': 'มูลค่าปัจจุบันสุทธิ',
      'calc.desc_irr': 'อัตราที่ NPV เป็นศูนย์',
      'calc.desc_capex': 'อุปกรณ์ + BOS/ติดตั้ง',
      'calc.desc_lcoe': 'ต้นทุนพลังงานเฉลี่ย',
      'calc.panel': 'แผงโซลาร์',
      'calc.hw_total': 'รวมอุปกรณ์',
      'calc.capex_bos': 'ลงทุนรวม (รวม BOS)',

      'calc.chart_load': 'โหลดไฟฟ้า',
      'calc.chart_self_consumed': 'ใช้เอง',
      'calc.chart_export': 'ส่งออก',
      'calc.chart_baseline': 'ค่าไฟเดิม',
      'calc.chart_post_pv': 'ค่าไฟหลัง PV',
      'calc.chart_pv_output': 'ผลิตไฟ PV (kWh)',
      'calc.chart_self_kwh': 'ใช้เอง [kWh]',
      'calc.chart_export_kwh': 'ส่งออก [kWh]',
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

      'filter.brand': 'ブランド',
      'filter.phase': 'フェーズ',
      'filter.kw_range': 'kW範囲',
      'filter.kwh_range': 'kWh範囲',
      'filter.recommend': 'インバーター推奨',
      'filter.recommend_bat': 'バッテリー推奨',

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

      'app.close': '閉じる',

      'calc.th_roof': '屋根',
      'calc.th_tilt': '傾斜 (°)',
      'calc.th_azimuth': '方位 (°)',
      'calc.th_area': '面積 (m²)',
      'calc.th_irradiation': '日射量 (kWh/m²/年)',
      'calc.th_topic': '項目',
      'calc.th_description': '説明',
      'calc.th_quantity': '数量',
      'calc.th_unit': '単位',
      'calc.th_item': 'アイテム',
      'calc.th_qty': '数量',
      'calc.th_spec': '仕様',
      'calc.th_unit_cost': '単価',
      'calc.th_total': '合計',

      'calc.loading_irr': 'PVGISから日射データを読込中...',
      'calc.loading_pv': 'PV出力を計算中...',
      'calc.select_prompt': 'プロジェクトを選択し、システム見積でレポートを生成します。',
      'calc.not_logged_in': '未ログイン',
      'calc.login_prompt': 'プロジェクトを表示するには',
      'calc.no_projects': 'プロジェクトなし',
      'calc.create_prompt': '先にワークスペースでプロジェクトを作成してください。',
      'calc.created': '作成日',
      'calc.location': '場所',
      'calc.roofs_label': '屋根',
      'calc.selected_prefix': '選択',

      'calc.self_consumption': '自家消費',
      'calc.annual_savings': '年間節約',
      'calc.payback': '回収期間',
      'calc.npv_label': 'NPV',
      'calc.irr_label': 'IRR',
      'calc.total_capex': '総投資額',
      'calc.lcoe': 'LCOE',
      'calc.desc_self': 'PV自家消費分',
      'calc.desc_savings': 'ベースライン料金 − PV後料金',
      'calc.desc_payback': '初期投資回収年数',
      'calc.desc_npv': 'キャッシュフロー正味現在価値',
      'calc.desc_irr': 'NPVゼロの割引率',
      'calc.desc_capex': '機器 + BOS/設置',
      'calc.desc_lcoe': '均等化発電原価',
      'calc.panel': 'パネル',
      'calc.hw_total': '機器合計',
      'calc.capex_bos': '総投資額（BOS込み）',

      'calc.chart_load': '電力負荷',
      'calc.chart_self_consumed': '自家消費',
      'calc.chart_export': '売電',
      'calc.chart_baseline': 'ベースライン料金',
      'calc.chart_post_pv': 'PV後料金',
      'calc.chart_pv_output': 'PV出力 (kWh)',
      'calc.chart_self_kwh': '自家消費 [kWh]',
      'calc.chart_export_kwh': '売電 [kWh]',
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
