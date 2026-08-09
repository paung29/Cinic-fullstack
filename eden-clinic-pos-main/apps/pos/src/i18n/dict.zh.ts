import type { TranslationDictionary } from './types';

export const dictZh = {
  // TODO(native-review)
  'brand.name': '伊甸诊所系统',
  // TODO(native-review)
  'brand.location': '腊戍 · 缅甸',
  // TODO(native-review)
  'shell.userName': 'Hkawn Mai 医生',
  // TODO(native-review)
  'shell.userRole': '管理员',
  // TODO(native-review)
  'shell.logout': '退出登录',
  // TODO(native-review)
  'shell.tab.home': '主页',
  // TODO(native-review)
  'shell.tab.calendar': '日历',
  // TODO(native-review)
  'shell.tab.clients': '客户',
  // TODO(native-review)
  'shell.tab.sale': '销售',
  // TODO(native-review)
  'shell.tab.stocks': '库存',
  // TODO(native-review)
  'shell.tab.analytics': '分析',
  // TODO(native-review)
  'shell.tab.hub': '中心',
  // TODO(native-review)
  'shell.tab.setup': '设置',
  // TODO(native-review)
  'sync.synced': '已同步',
  // TODO(native-review)
  'sync.syncing': '同步中',
  // TODO(native-review)
  'sync.offline': '离线',
  // TODO(native-review)
  'sync.attention': '需要处理',
  // TODO(native-review)
  'demo.eyebrow': '伊甸诊所系统',
  // TODO(native-review)
  'demo.title': '组件演示',
  // TODO(native-review)
  'demo.subtitle': 'M1 可复用界面基础',
  // TODO(native-review)
  'demo.section.actions': '操作',
  // TODO(native-review)
  'demo.section.status': '状态标签',
  // TODO(native-review)
  'demo.section.fields': '表单字段',
  // TODO(native-review)
  'demo.section.controls': '控件',
  // TODO(native-review)
  'demo.section.feedback': '反馈',
  // TODO(native-review)
  'demo.section.loading': '加载与空状态',
  // TODO(native-review)
  'demo.section.stats': '统计卡片',
  // TODO(native-review)
  'action.primary': '主要操作',
  // TODO(native-review)
  'action.ghost': '次要操作',
  // TODO(native-review)
  'action.danger': '危险操作',
  // TODO(native-review)
  'action.ai': 'AI 操作',
  // TODO(native-review)
  'action.openModal': '打开弹窗',
  // TODO(native-review)
  'action.enqueueToasts': '加入消息队列',
  // TODO(native-review)
  'action.dismiss': '关闭',
  // TODO(native-review)
  'action.empty': '添加服务',
  // TODO(native-review)
  'tag.ok': '可用',
  // TODO(native-review)
  'tag.low': '库存不足',
  // TODO(native-review)
  'tag.amber': '待处理',
  // TODO(native-review)
  'tag.blue': '信息',
  // TODO(native-review)
  'tag.ai': 'AI 附加功能',
  // TODO(native-review)
  'field.name': '客户姓名',
  // TODO(native-review)
  'field.namePlaceholder': '输入客户姓名',
  // TODO(native-review)
  'field.service': '服务',
  // TODO(native-review)
  'field.servicePlaceholder': '选择服务',
  // TODO(native-review)
  'field.helper': '字段可支持离线工作流程。',
  // TODO(native-review)
  'switch.label': '启用关怀流程预览',
  // TODO(native-review)
  'pin.title': '管理员 PIN',
  // TODO(native-review)
  'pin.backspace': '删除最后一位',
  // TODO(native-review)
  'pin.submit': '提交 PIN',
  // TODO(native-review)
  'tabs.label': '演示标签页',
  // TODO(native-review)
  'tabs.first': '概览',
  // TODO(native-review)
  'tabs.second': '队列',
  // TODO(native-review)
  'tabs.third': '历史',
  // TODO(native-review)
  'empty.title': '还没有服务',
  // TODO(native-review)
  'empty.body': '目录在 M2 到达时添加第一项服务。',
  // TODO(native-review)
  'skeleton.label': '正在加载预览',
  // TODO(native-review)
  'modal.title': '弹窗表面',
  // TODO(native-review)
  'modal.body': '按 Escape 或点击背景可关闭这个使用令牌的弹窗。',
  // TODO(native-review)
  'modal.close': '关闭弹窗',
  // TODO(native-review)
  'toast.first': '第一条队列消息',
  // TODO(native-review)
  'toast.second': '第二条队列消息',
  // TODO(native-review)
  'locale.label': '预览语言',
  // TODO(native-review)
  'locale.my': 'မြန်မာ (MY)',
  // TODO(native-review)
  'locale.en': 'English (EN)',
  // TODO(native-review)
  'locale.zh': '简体中文 (ZH)',
  // TODO(native-review)
  'demo.burmeseSample': 'ကျေးဇူးတင်ပါသည်',
  // TODO(native-review): intentionally omitted M1 dev-only fallback fixture.
  // 'demo.fallbackProbe': 'English fallback probe',
  // TODO(native-review)
  'stat.collected': '已收款',
  // TODO(native-review)
  'stat.outstanding': '未收款',
  // TODO(native-review)
  'stat.collectedValue': '125,000 缅元',
  // TODO(native-review)
  'stat.outstandingValue': '68,000 缅元',
  // TODO(native-review)
  'auth.setup.title': '设置此设备',
  // TODO(native-review)
  'auth.setup.staffId': '安装人员员工 ID',
  // TODO(native-review)
  'auth.setup.internetRequired': '此设备必须先连接互联网完成一次设置。',
  // TODO(native-review)
  'auth.setup.repair': '此会话需要在线登录才能修复此设备。',
  // TODO(native-review)
  'auth.login.who': '谁在工作？',
  // TODO(native-review)
  'auth.login.pin': '输入 PIN',
  // TODO(native-review)
  'auth.login.wrongPin': 'PIN 不正确',
  'auth.login.signInFailed': 'PIN 已通过验证，但登录未能完成。请重试。',
  'auth.sessionExpired': '服务器已将此设备登出。请重新输入员工 PIN 以重新连接。', // TODO(native-review)
  'auth.adminPasswordWrong': '管理员密码不正确。', // TODO(native-review)
  // TODO(native-review)
  'auth.login.wait': '请稍候再试',
  // TODO(native-review)
  'auth.login.loading': '正在准备此设备',
  // TODO(native-review)
  'auth.logout.blocked': '请先同步排队的工作，再退出登录',
  // TODO(native-review)
  'sale.title': '销售',
  // TODO(native-review)
  'sale.catalogue': '目录',
  // TODO(native-review)
  'sale.cart': '购物车',
  // TODO(native-review)
  'sale.services': '服务',
  // TODO(native-review)
  'sale.products': '产品',
  // TODO(native-review)
  'sale.search': '搜索目录',
  // TODO(native-review)
  'sale.scanner': '扫描条码',
  // TODO(native-review)
  'sale.emptyCart': '添加服务或产品以开始',
  // TODO(native-review)
  'sale.add': '添加',
  // TODO(native-review)
  'sale.remove': '移除',
  // TODO(native-review)
  'sale.quantity': '数量',
  // TODO(native-review)
  'sale.note': '备注',
  // TODO(native-review)
  'sale.lot': '批号',
  // TODO(native-review)
  'sale.expiry': '到期日',
  // TODO(native-review)
  'sale.lotTitle': '添加追溯信息',
  // TODO(native-review)
  'sale.lotPrefill': '扫描 GS1 DataMatrix（演示预填）',
  // TODO(native-review)
  'sale.weightTitle': '设置数量',
  // TODO(native-review)
  'sale.restricted': '此商品不能通过扫描器销售。',
  // TODO(native-review)
  'sale.unknown': '未找到条码。请保留此代码用于产品设置。',
  // TODO(native-review)
  'sale.saveTicket': '保存单据',
  // TODO(native-review)
  'sale.resumeTicket': '恢复单据',
  // TODO(native-review)
  'sale.patient': '患者',
  // TODO(native-review)
  'sale.walkIn': '散客',
  // TODO(native-review)
  'sale.discount': '折扣',
  // TODO(native-review)
  'sale.complete': '完成销售',
  // TODO(native-review)
  'sale.tenderTitle': '收款',
  // TODO(native-review)
  'sale.cash': '现金',
  // TODO(native-review)
  'sale.kbzpay': 'KBZPay',
  // TODO(native-review)
  'sale.wave': 'Wave',
  // TODO(native-review)
  'sale.split': '拆分付款',
  // TODO(native-review)
  'sale.payLater': '稍后付款',
  // TODO(native-review)
  'sale.balance': '待付余额',
  // TODO(native-review)
  'sale.change': '找零',
  // TODO(native-review)
  'sale.credit': '赊账',
  // TODO(native-review)
  'sale.approval': '管理员批准',
  // TODO(native-review)
  'sale.approvalTitle': '验证管理员',
  // TODO(native-review)
  'sale.receipt': '收据',
  // TODO(native-review)
  'sale.waitingSync': '等待同步',
  // TODO(native-review)
  'sale.print': '打印',
  // TODO(native-review)
  'sale.share': '分享',
  // TODO(native-review)
  'sale.done': '完成',
  // TODO(native-review)
  'sale.category.all': '全部',
  // TODO(native-review)
  'sale.category.laser': '激光',
  // TODO(native-review)
  'sale.category.injectables': '注射类',
  // TODO(native-review)
  'sale.category.browsLips': '眉眼与唇部',
  // TODO(native-review)
  'sale.category.skin': '皮肤',
  // TODO(native-review)
  'sale.discount.custom': '自定义',
  // TODO(native-review)
  'auth.role.admin': '管理员',
  // TODO(native-review)
  'auth.role.staff': '员工',
  // TODO(native-review)
  'shell.offlineAdminAttention': '此设备尚未为离线审批设置管理员。管理员必须在线登录一次。',
  // TODO(native-review)
  'auth.envelopes.open': '管理离线管理员',
  // TODO(native-review)
  'auth.envelopes.title': '离线管理员凭据',
  // TODO(native-review)
  'auth.envelopes.password': '管理员密码',
  // TODO(native-review)
  'auth.envelopes.confirmOnline': '使用密码确认',
  // TODO(native-review)
  'auth.envelopes.offlineWarning': '离线移除后，此人须待管理员再次在线登录才能重新配置。',
  // TODO(native-review)
  'auth.envelopes.confirmOffline': '使用 PIN 确认',
  // TODO(native-review)
  'auth.envelopes.lastAdmin': '无法在本机移除最后一位活跃的离线管理员。',
  // TODO(native-review)
  'auth.envelopes.failed': '无法确认移除操作。',
  // TODO(native-review)
  'clients.search': '搜索患者',
  // TODO(native-review)
  'clients.new': '新建患者',
  // TODO(native-review)
  'clients.emptyTitle': '还没有患者',
  // TODO(native-review)
  'clients.emptyBody': '创建第一位患者以开始建立本地记录。',
  // TODO(native-review)
  'clients.noMatches': '没有匹配的患者',
  // TODO(native-review)
  'clients.form.name': '姓名',
  // TODO(native-review)
  'clients.form.phone': '电话',
  // TODO(native-review)
  'clients.form.sex': '性别',
  // TODO(native-review)
  'clients.form.allergies': '过敏信息',
  // TODO(native-review)
  'clients.form.telegram': '已关联 Telegram',
  // TODO(native-review)
  'clients.form.save': '保存患者',
  // TODO(native-review)
  'clients.profile.localCode': '本地记录',
  // TODO(native-review)
  'clients.profile.book': '预约',
  // TODO(native-review)
  'clients.profile.newSale': '新建销售',
  // TODO(native-review)
  'clients.profile.alert': '临床提醒',
  // TODO(native-review)
  'clients.profile.outstanding': '未结余额',
  // TODO(native-review)
  'clients.profile.visits': '就诊次数',
  // TODO(native-review)
  'clients.profile.followup': '下次随访',
  // TODO(native-review)
  'clients.profile.none': '无',
  // TODO(native-review)
  'clients.profile.clinical': '临床',
  // TODO(native-review)
  'clients.profile.clinicalHistory': '治疗记录',
  // TODO(native-review)
  'clients.profile.unlocked': '已解锁',
  // TODO(native-review)
  'clients.profile.unlock': '解锁临床视图',
  // TODO(native-review)
  'clients.profile.locked': '临床记录需要在线管理员密码。',
  // TODO(native-review)
  'clients.profile.noVisits': '尚无本地治疗记录。',
  // TODO(native-review)
  'clients.profile.recall': '随访',
  // TODO(native-review)
  'clients.profile.recallBody': '可从本地诊所记录获得随访提示。',
  // TODO(native-review)
  'clients.profile.password': '管理员密码',
  // TODO(native-review)
  'clients.profile.unlockFailed': '无法解锁临床视图。',
  // TODO(native-review)
  'calendar.title': '日历',
  // TODO(native-review)
  'calendar.day': '日期',
  // TODO(native-review)
  'calendar.book': '预约',
  // TODO(native-review)
  'calendar.bookTitle': '预约',
  // TODO(native-review)
  'calendar.staff': '治疗师',
  // TODO(native-review)
  'calendar.time': '时间',
  // TODO(native-review)
  'calendar.patient': '患者',
  // TODO(native-review)
  'calendar.service': '服务',
  // TODO(native-review)
  'calendar.newPatient': '新建患者',
  // TODO(native-review)
  'calendar.saveAppointment': '保存预约',
  // TODO(native-review)
  'calendar.slotOccupied': '此设备上的这个时间已被预约。',
  // TODO(native-review)
  'calendar.noBookings': '这一天没有预约。',
  // TODO(native-review)
  'calendar.appointment': '预约',
  // TODO(native-review)
  'calendar.here': '标记到店',
  // TODO(native-review)
  'calendar.cancel': '取消预约',
  // TODO(native-review)
  'calendar.charge': '进入销售',
  // TODO(native-review)
  'calendar.conflict': '需要服务器审核',
  // TODO(native-review)
  'calendar.status.booked': '已预约',
  // TODO(native-review)
  'calendar.status.here': '已到店',
  // TODO(native-review)
  'calendar.status.done': '已完成',
  // TODO(native-review)
  'calendar.status.cancelled': '已取消',
  // TODO(native-review)
  'calendar.patientName': '患者姓名',
  // TODO(native-review)
  'calendar.patientPhone': '患者电话',
  // TODO(native-review)
  'calendar.createPatient': '创建患者',
  // TODO(native-review)
  'calendar.noPatient': '请先选择患者。',
  'setup.clinicName': '诊所名称', // TODO(native-review)
  'setup.title': '设置', // TODO(native-review)
  'setup.receipt': '收据设计', // TODO(native-review)
  'setup.receiptFooter': '收据页脚', // TODO(native-review)
  'setup.phone': '电话', // TODO(native-review)
  'setup.address': '地址', // TODO(native-review)
  'setup.logoUrl': '标志 URL', // TODO(native-review)
  'setup.rounding': '取整步长', // TODO(native-review)
  'setup.creditLimit': '赊账额度', // TODO(native-review)
  'setup.consent': '同意模式', // TODO(native-review)
  'setup.consent.off': '关闭', // TODO(native-review)
  'setup.consent.warn': '警告', // TODO(native-review)
  'setup.consent.block': '阻止', // TODO(native-review)
  'setup.receiptQr': '显示 Telegram 标记', // TODO(native-review)
  'setup.receiptNextVisit': '显示下次到访提醒', // TODO(native-review)
  'setup.template': '模板', // TODO(native-review)
  'setup.headerFont': '标题字体', // TODO(native-review)
  'setup.divider': '分隔线', // TODO(native-review)
  'setup.template.classic': '经典', // TODO(native-review)
  'setup.template.modern': '现代', // TODO(native-review)
  'setup.template.minimal': '极简', // TODO(native-review)
  'setup.template.boxed': '方框', // TODO(native-review)
  'setup.font.sans': '无衬线', // TODO(native-review)
  'setup.font.serif': '衬线', // TODO(native-review)
  'setup.font.display': '展示', // TODO(native-review)
  'setup.divider.line': '线条', // TODO(native-review)
  'setup.divider.dots': '点线', // TODO(native-review)
  'setup.divider.none': '无', // TODO(native-review)
  'setup.save': '保存', // TODO(native-review)
  'setup.saveOffline': '设置更改需要互联网连接。', // TODO(native-review)
  'setup.elevate': '确认管理员密码', // TODO(native-review)
  'setup.password': '密码', // TODO(native-review)
  'setup.hardware': '打印机硬件', // TODO(native-review)
  'setup.width': '收据宽度', // TODO(native-review)
  'setup.width80': '80 毫米', // TODO(native-review)
  'setup.width58': '58 毫米', // TODO(native-review)
  'setup.transport': '打印传输', // TODO(native-review)
  'setup.testPrint': '测试打印', // TODO(native-review)
  'setup.locale': '语言', // TODO(native-review)
  'setup.addons': '许可附加组件', // TODO(native-review)
  'stocks.title': '库存', // TODO(native-review)
  'stocks.add': '添加产品', // TODO(native-review)
  'stocks.receive': '收货', // TODO(native-review)
  'stocks.edit': '编辑产品', // TODO(native-review)
  'stocks.name': '名称', // TODO(native-review)
  'stocks.category': '类别', // TODO(native-review)
  'stocks.barcode': '条码', // TODO(native-review)
  'stocks.soldBy': '按单位销售', // TODO(native-review)
  'stocks.each': '每件', // TODO(native-review)
  'stocks.weight': '重量', // TODO(native-review)
  'stocks.cost': '进价', // TODO(native-review)
  'stocks.price': '售价', // TODO(native-review)
  'stocks.stock': '库存', // TODO(native-review)
  'stocks.lowStock': '低库存', // TODO(native-review)
  'stocks.type': '类型', // TODO(native-review)
  'stocks.lot': '批号', // TODO(native-review)
  'stocks.expiry': '到期日', // TODO(native-review)
  'stocks.lookup': '查询条码', // TODO(native-review)
  'stocks.save': '保存产品', // TODO(native-review)
  'stocks.pending': '同步后才能编辑', // TODO(native-review)
  'stocks.duplicateBarcode': '此条码属于另一个产品。', // TODO(native-review)
  'stocks.margin': '毛利', // TODO(native-review)
  'stocks.retire': '停用产品', // TODO(native-review)
  'shell.switchUser': '切换用户', // TODO(native-review)
  'shell.storageAttention': '浏览器存储未受保护。请勿清除此设备上的浏览器数据。', // TODO(native-review)
  'shell.tab.today': '今日', // TODO(native-review)
  'today.title': '今日', // TODO(native-review)
  'today.totalCollected': '已收总额', // TODO(native-review)
  'today.creditOutstanding': '未收欠款', // TODO(native-review)
  'today.otherMethods': '其他付款方式', // TODO(native-review)
  'today.staffBreakdown': '员工明细', // TODO(native-review)
  'today.needsReview': '需要审核', // TODO(native-review)
  'today.pendingSync': '等待同步', // TODO(native-review)
  'today.debtors': '欠款账龄', // TODO(native-review)
  'today.lowStock': '低库存', // TODO(native-review)
  'today.noDebtors': '没有未结欠款。', // TODO(native-review)
  'today.noLowStock': '没有低库存产品。', // TODO(native-review)
  'today.recentSales': '最近销售', // TODO(native-review)
  'today.reprint': '重新打印', // TODO(native-review)
  'today.age.0-7': '0–7 天', // TODO(native-review)
  'today.age.8-30': '8–30 天', // TODO(native-review)
  'today.age.31-60': '31–60 天', // TODO(native-review)
  'today.age.61+': '61 天以上', // TODO(native-review)
  'shift.close': '交班结算', // TODO(native-review)
  'shift.closeTitle': '交班结算', // TODO(native-review)
  'shift.openingCash': '开班现金', // TODO(native-review)
  'shift.cashSales': '现金销售', // TODO(native-review)
  'shift.expectedCash': '应有现金', // TODO(native-review)
  'shift.countedCash': '实点现金', // TODO(native-review)
  'shift.difference': '差额', // TODO(native-review)
  'shift.blockedSync': '请先同步所有排队工作，再进行交班结算。', // TODO(native-review)
  'shift.adminRequired': '必须由管理员进行交班结算。', // TODO(native-review)
  'shift.saved': '交班结算已保存在此设备上。', // TODO(native-review)
  'setup.storage': '存储诊断', // TODO(native-review)
  'setup.storage.granted': '浏览器存储保护已启用。', // TODO(native-review)
  'setup.storage.notGranted': '浏览器存储保护未获授权。', // TODO(native-review)
  'setup.storage.unavailable': '浏览器存储保护不可用。', // TODO(native-review)
  'setup.storage.usage': '已用存储', // TODO(native-review)
  'setup.storage.refresh': '刷新状态', // TODO(native-review)
  'setup.storage.export': '导出 Outbox 供支持使用', // TODO(native-review)
  'setup.storage.exportPassword': '支持导出密码', // TODO(native-review)
  'setup.storage.exportConfirm': '确认并下载', // TODO(native-review)
  'setup.storage.internetRequired': '导出支持数据需要互联网连接。', // TODO(native-review)
  'receipt.copy': '副本', // TODO(native-review)
  'pwa.updateReady': '更新已准备就绪', // TODO(native-review)
  'pwa.restart': '重新启动', // TODO(native-review)
  'pwa.finishOrAbandon': '请先完成或放弃当前购物车。', // TODO(native-review)
  'notFound.title': '此页面不可用', // TODO(native-review)
  'notFound.body': '请返回员工登录页面继续。', // TODO(native-review)
  'notFound.returnToLogin': '返回登录', // TODO(native-review)
  'auth.setup.createClinic': '创建新诊所', // TODO(native-review)
  'auth.setup.useExisting': '使用现有诊所', // TODO(native-review)
  'auth.setup.clinicName': '诊所名称', // TODO(native-review)
  'auth.setup.clinicPhone': '诊所电话', // TODO(native-review)
  'auth.setup.clinicAddress': '诊所地址', // TODO(native-review)
  'auth.setup.adminName': '管理员姓名', // TODO(native-review)
  'auth.setup.adminPhone': '管理员电话', // TODO(native-review)
  'auth.setup.adminEmail': '管理员邮箱', // TODO(native-review)
  'auth.setup.adminPassword': '管理员密码', // TODO(native-review)
  'clients.profile.edit': '编辑', // TODO(native-review)
  'clients.profile.editTitle': '编辑患者资料', // TODO(native-review)
  'clients.profile.updated': '患者资料已保存。', // TODO(native-review)
  'clients.profile.visitNotes': '就诊记录', // TODO(native-review)
  'clients.profile.prescriptions': '处方', // TODO(native-review)
  'clients.profile.saveRecord': '保存诊疗记录', // TODO(native-review)
  'clients.profile.recordSaved': '诊疗记录已保存。', // TODO(native-review)
  'clients.profile.saveFailed': '无法保存。请检查网络后重试。', // TODO(native-review)
  'setup.operations': '运营管理', // TODO(native-review)
  'setup.operationsBody': '报表、回访、销售作废与库存更正。', // TODO(native-review)
  'setup.operationsOpen': '打开运营管理', // TODO(native-review)
  'ops.eyebrow': '管理', // TODO(native-review)
  'ops.title': '运营与报表', // TODO(native-review)
  'ops.backToSetup': '返回设置', // TODO(native-review)
  'ops.report.title': '每日报表', // TODO(native-review)
  'ops.report.date': '报表日期', // TODO(native-review)
  'ops.report.load': '加载报表', // TODO(native-review)
  'ops.report.collected': '已收款', // TODO(native-review)
  'ops.report.delivered': '销售总额', // TODO(native-review)
  'ops.report.newCredit': '新增赊账', // TODO(native-review)
  'ops.report.sales': '销售笔数', // TODO(native-review)
  'ops.followups.title': '即将到期的回访', // TODO(native-review)
  'ops.followups.empty': '未来 30 天内没有回访。', // TODO(native-review)
  'ops.void.title': '作废销售', // TODO(native-review)
  'ops.void.sale': '销售单', // TODO(native-review)
  'ops.void.reason': '原因', // TODO(native-review)
  'ops.void.defaultReason': '录入错误', // TODO(native-review)
  'ops.void.submit': '作废销售', // TODO(native-review)
  'ops.void.empty': '暂无可作废的销售。', // TODO(native-review)
  'ops.void.done': '销售已作废，库存已恢复。', // TODO(native-review)
  'ops.adjust.title': '调整库存', // TODO(native-review)
  'ops.adjust.product': '商品', // TODO(native-review)
  'ops.adjust.delta': '变动数量 (+ / −)', // TODO(native-review)
  'ops.adjust.reason': '原因', // TODO(native-review)
  'ops.adjust.reasonAdjust': '更正', // TODO(native-review)
  'ops.adjust.reasonWaste': '损耗', // TODO(native-review)
  'ops.adjust.reasonExpiry': '过期', // TODO(native-review)
  'ops.adjust.submit': '保存调整', // TODO(native-review)
  'ops.adjust.done': '库存已调整。', // TODO(native-review)
  'ops.license.title': '许可证', // TODO(native-review)
  'ops.license.status': '状态', // TODO(native-review)
  'ops.license.termEnds': '有效期至', // TODO(native-review)
  'ops.license.graceEnds': '宽限期至', // TODO(native-review)
  'ops.license.offline': '联网后才能查看许可证状态。', // TODO(native-review)
  'ops.staff.title': '添加员工账号', // TODO(native-review)
  'ops.staff.pin': '4 位 PIN 码', // TODO(native-review)
  'ops.staff.email': '邮箱', // TODO(native-review)
  'ops.staff.password': '密码', // TODO(native-review)
  'ops.staff.role': '角色', // TODO(native-review)
  'ops.staff.roleStaff': '员工', // TODO(native-review)
  'ops.staff.roleAdmin': '管理员', // TODO(native-review)
  'ops.staff.submit': '创建员工账号', // TODO(native-review)
  'ops.staff.done': '员工账号已创建。', // TODO(native-review)
  'ops.export.title': '服务器数据导出', // TODO(native-review)
  'ops.export.body': '从服务器导出患者、员工、目录与销售数据。始终需要管理员密码。', // TODO(native-review)
  'ops.export.submit': '下载导出数据', // TODO(native-review)
  'ops.adminOnly': '只有管理员才能打开运营管理。', // TODO(native-review)
  'ops.failed': '操作未能完成。请检查网络后重试。', // TODO(native-review)
  'shell.storageTag': '存储未受保护', // TODO(native-review)
  'today.allClear': '全部正常', // TODO(native-review)
  'calendar.todayJump': '今天', // TODO(native-review)
  'sale.emptyCatalogue': '该分类暂无项目。', // TODO(native-review)
  'stocks.empty': '暂无商品 — 添加或收货。', // TODO(native-review)
  'analytics.locked': '分析已锁定', // TODO(native-review)
  'analytics.lockedBody': '全店财务数据由管理员密码保护，与员工密码分开。', // TODO(native-review)
  'analytics.unlock': '解锁', // TODO(native-review)
  'analytics.tab.overview': '概览', // TODO(native-review)
  'analytics.tab.payroll': '薪资', // TODO(native-review)
  'analytics.tab.expenses': '支出', // TODO(native-review)
  'analytics.range.daily': '按日', // TODO(native-review)
  'analytics.range.weekly': '按周', // TODO(native-review)
  'analytics.range.monthly': '按月', // TODO(native-review)
  'analytics.range.yearly': '按年', // TODO(native-review)
  'analytics.revenue': '营收', // TODO(native-review)
  'analytics.costOfGoods': '商品成本', // TODO(native-review)
  'analytics.grossProfit': '毛利', // TODO(native-review)
  'analytics.netProfit': '净利', // TODO(native-review)
  'analytics.margin': '利润率', // TODO(native-review)
  'analytics.profitLine': '营收减去所有成本、薪资与支出。', // TODO(native-review)
  'analytics.total': '合计', // TODO(native-review)
  'analytics.avg.daily': '日均', // TODO(native-review)
  'analytics.avg.weekly': '周均', // TODO(native-review)
  'analytics.avg.monthly': '月均', // TODO(native-review)
  'analytics.avg.yearly': '年均', // TODO(native-review)
  'analytics.payrollHint': '每位员工的固定月薪。保存在此设备上。', // TODO(native-review)
  'analytics.salary': '月薪', // TODO(native-review)
  'analytics.totalPayroll': '月薪总额', // TODO(native-review)
  'analytics.expensesHint': '库存以外的经常性与一次性支出。保存在此设备上。', // TODO(native-review)
  'analytics.addExpense': '添加支出', // TODO(native-review)
  'analytics.expenseLabel': '说明', // TODO(native-review)
  'analytics.amount': '金额', // TODO(native-review)
  'analytics.thisMonth': '本月', // TODO(native-review)
  'analytics.removeExpense': '删除支出', // TODO(native-review)
  'analytics.cat.rent': '租金', // TODO(native-review)
  'analytics.cat.utilities': '水电', // TODO(native-review)
  'analytics.cat.supplies': '耗材', // TODO(native-review)
  'analytics.cat.marketing': '营销', // TODO(native-review)
  'analytics.cat.equipment': '设备', // TODO(native-review)
  'analytics.cat.other': '其他', // TODO(native-review)
  'sale.addService': '添加服务', // TODO(native-review)
  'sale.editServices': '编辑服务', // TODO(native-review)
  'service.nameEn': '名称（英文）', // TODO(native-review)
  'service.nameMm': '名称（缅文）', // TODO(native-review)
  'service.category': '类别', // TODO(native-review)
  'service.price': '价格', // TODO(native-review)
  'service.durationMin': '时长（分钟）', // TODO(native-review)
  'service.followUpDays': '复诊间隔（天）', // TODO(native-review)
  'service.requiresLot': '需要批号', // TODO(native-review)
  'service.active': '可预约与销售', // TODO(native-review)
  'service.save': '保存服务', // TODO(native-review)
  'service.saved': '服务已保存。', // TODO(native-review)
  'service.pick': '服务', // TODO(native-review)
  'clients.form.sexF': '女', // TODO(native-review)
  'clients.form.sexM': '男', // TODO(native-review)
  'photo.library': '照片库', // TODO(native-review)
  'photo.hint': '每次疗程的前后对比照片与改善评级。', // TODO(native-review)
  'photo.addSession': '添加疗程', // TODO(native-review)
  'photo.framePair': '术前术后一组', // TODO(native-review)
  'photo.before': '术前', // TODO(native-review)
  'photo.after': '术后', // TODO(native-review)
  'photo.dropBefore': '放入术前照片', // TODO(native-review)
  'photo.dropAfter': '放入术后照片', // TODO(native-review)
  'photo.note': '备注 — 光线、角度、治疗部位', // TODO(native-review)
  'photo.title': '治疗', // TODO(native-review)
  'photo.defaultTitle': '新到访', // TODO(native-review)
  'photo.improvement': '改善程度', // TODO(native-review)
  'photo.grNone': '无', // TODO(native-review)
  'photo.grSlight': '轻微', // TODO(native-review)
  'photo.grModerate': '中等', // TODO(native-review)
  'photo.grMarked': '显著', // TODO(native-review)
  'photo.grPending': '未评级', // TODO(native-review)
  'photo.noPhotosTitle': '暂无照片', // TODO(native-review)
  'photo.noPhotosBody': '添加疗程以开始该患者的前后对比记录。', // TODO(native-review)
  'photo.viewPhotos': '查看照片', // TODO(native-review)
  'photo.done': '完成', // TODO(native-review)
  'photo.removeSession': '删除疗程', // TODO(native-review)
  'setup.telegramHandle': 'Telegram 账号', // TODO(native-review)
  'setup.font.geometric': '几何 (Montserrat)', // TODO(native-review)
  'setup.font.rounded': '圆润 (Poppins)', // TODO(native-review)
  'setup.font.elegant': '优雅 (Cormorant Garamond)', // TODO(native-review)
  'setup.logo': '品牌标志', // TODO(native-review)
  'setup.logoHint': '打印在诊所名称上方。会转换为黑白以适配收据打印机。', // TODO(native-review)
  'setup.logoChoose': '选择标志', // TODO(native-review)
  'setup.logoReplace': '更换标志', // TODO(native-review)
  'setup.logoRemove': '移除标志', // TODO(native-review)
  'setup.logoNone': '尚未添加标志 — 仅打印诊所名称。', // TODO(native-review)
  'setup.logoTooBig': '图片过大。请使用小于 4 MB 的图片。', // TODO(native-review)
} satisfies Partial<TranslationDictionary>;
