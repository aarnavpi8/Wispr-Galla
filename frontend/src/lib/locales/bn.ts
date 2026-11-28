import type { Locale } from "./en";

// Bengali. Written by the team; needs a native-speaker review.
export const bn: Locale = {
  morning: "সুপ্রভাত",
  afternoon: "নমস্কার",
  evening: "শুভ সন্ধ্যা",
  tagline: "BolKhata · বলুন, হিসাব লেখা হবে",
  language: "ভাষা",
  chooseLanguage: "আপনার ভাষা বেছে নিন",
  chooseLanguageSub: "পরে যেকোনো সময় বদলাতে পারবেন।",
  start: "শুরু করুন",
  spinHint: "স্ক্রল, সোয়াইপ বা ট্যাপ করে ঘোরান",

  loginTitle1: "বলুন, আর",
  loginTitleAccent: "হিসাব",
  loginTitle2: "লেখা হয়ে যাক।",
  loginSub: "কাউন্টারে যেভাবে কথা বলেন, সেভাবেই বলুন। BolKhata খাতা, বিক্রি আর দিনের হিসাব সামলাবে।",
  youSay: "আপনি বলেন",
  loginGoogle: "Google দিয়ে লগইন করুন",
  loginDemo: "লগইন ছাড়া ডেমো দেখুন",
  loginFailed: "Google লগইন হয়নি। আবার চেষ্টা করুন।",
  domainNotAllowed: "এই ওয়েবসাইট Firebase-এ অনুমোদিত নয় (Authentication → Settings → Authorized domains)।",
  loginProviderOff: "Google লগইন এখনও চালু হয়নি। Firebase-এ: Authentication → Sign-in method → Google → Enable।",
  loginPopupBlocked: "লগইন উইন্ডো আটকে গেছে। এই সাইটের পপ-আপ চালু করে আবার চেষ্টা করুন।",
  account: "অ্যাকাউন্ট",
  guest: "অতিথি",
  logout: "লগআউট",
  demoMode: "ডেমো মোড",
  demoModeSub: "লগইন করে নিজের দোকানের হিসাব রাখুন।",
  googleLogin: "Google দিয়ে লগইন",
  demoShop: "ডেমো দোকান",
  loginOffNote: "Google লগইন সেট করা নেই (Firebase keys নেই)। সবকিছু লগইন ছাড়াই চলে।",

  expectedCash: "ক্যাশবাক্সে থাকা উচিত",
  today: "আজ",
  week: "৭ দিন",
  sales: "বিক্রি",
  collected: "আদায় হয়েছে",
  udhaarGiven: "ধার দেওয়া",
  cashOut: "নগদ গেছে",
  openingNote: "শুরুতে {x} · আজকের নগদ এন্ট্রির পরে",
  aiOff: "AI key নেই: নিজস্ব নিয়ম আপনার এন্ট্রি বোঝে।",

  speakOrType: "বলুন বা লিখুন",
  next: "পরবর্তী",
  clear: "মুছুন",
  holdToSpeak: "চেপে বলুন",
  stopListening: "থামুন",
  listening: "শুনছি…",
  micNoSpeech: "আবার বলুন",
  micDenied: "মাইকের অনুমতি দিন",
  micFailed: "মাইক চলেনি",
  transcribing: "লিখছি…",
  wisprFailed: "কথা লেখায় রূপান্তর করা যায়নি। আবার বলুন বা লিখুন।",
  wisprOn: "Wispr Flow কণ্ঠ",
  ex1: "শর্মা জি 500 UPI তে দিলেন",
  ex2: "রমেশকে 2 কেজি চিনি ধার, 15 তারিখ পর্যন্ত",
  ex3: "গুপ্তা ডিস্ট্রিবিউটরের মাল এল 3,200-র, 1,000 নগদ দিলাম",
  ex4: "বিদ্যুৎ বিল 850 দিলাম",
  notSaved: "এন্ট্রি কার্ড (flow 1) এখনও তৈরি হচ্ছে। এই এন্ট্রি সেভ হয়নি।",

  overdue: "{n} জন গ্রাহকের ধার তারিখ পেরিয়েছে",
  overdueSub: "মোট বাকি ধার {x} · রিমাইন্ডারের জন্য ট্যাপ করুন",

  weekSales: "বিক্রি, গত ৭ দিন",
  cashLabel: "নগদ",
  upiLabel: "UPI",
  wd0: "রবি",
  wd1: "সোম",
  wd2: "মঙ্গল",
  wd3: "বুধ",
  wd4: "বৃহঃ",
  wd5: "শুক্র",
  wd6: "শনি",

  justNow: "এইমাত্র",
  minsAgo: "{n} মিনিট আগে",
  hoursAgo: "{n} ঘণ্টা আগে",
  yesterday: "গতকাল",
  daysAgo: "{n} দিন আগে",

  eSaleCash: "বিক্রি · নগদ",
  eSaleUpi: "বিক্রি · UPI",
  eSaleUdhaar: "ধারে বিক্রি",
  eUdhaar: "ধার দেওয়া",
  ePaidCash: "টাকা এল · নগদ",
  ePaidUpi: "টাকা এল · UPI",
  ePaidSupplier: "সাপ্লায়ারকে দেওয়া",
  ePurchase: "মাল এল",
  eExpense: "খরচ",
  eWithdrawal: "বাড়ির জন্য",
  eBillItem: "বিলের জিনিস",
  eCommand: "নির্দেশ",
  noEntries: "এখনও কোনো এন্ট্রি নেই। উপরে বলুন!",

  tabEntries: "হিসাব",
  tabKhata: "খাতা",
  searchName: "নাম খুঁজুন",
  customers: "গ্রাহক",
  suppliers: "সাপ্লায়ার",
  overdueDays: "{n} দিন ধরে বাকি",
  settled: "হিসাব মিলেছে",
  advance: "অগ্রিম দেওয়া আছে",
  due: "বাকি আছে",
  nobody: "কাউকে পাওয়া যায়নি।",

  customer: "গ্রাহক",
  supplier: "সাপ্লায়ার",
  theyOwe: "এঁর কাছে পাওনা",
  theirAdvance: "এঁর অগ্রিম",
  youOwe: "আপনার দেনা",
  dueOver: "তারিখ পেরিয়েছে: {d}",
  makeReminder: "WhatsApp রিমাইন্ডার বানান",
  reminderNote: "WhatsApp খুলবে, মেসেজ দেখে আপনি Send চাপুন।",
  noPartyEntries: "কোনো এন্ট্রি নেই।",
  history: "ইতিহাস",
  reminderMsg: "নমস্কার {name}, {shop} থেকে মনে করিয়ে দিচ্ছি: আপনার {x} বাকি আছে। সুবিধা হলে UPI তে পাঠিয়ে দিন: {upi} ধন্যবাদ",

  navHome: "আজ",
  navAccounts: "হিসাব",
  navStock: "মাল",
  navKhata: "খাতা",
  speak: "বলুন",

  accountsTitle: "হিসাব-নিকাশ",
  accountsSub: "গত {n} দিন",
  receivable: "পাওনা",
  receivableSub: "গ্রাহকদের কাছে",
  payable: "দেনা",
  payableSub: "সাপ্লায়ারকে",
  net: "লাভ (আনুমানিক)",
  netSub: "বিক্রি − বিক্রি মালের খরচ − নষ্ট − খরচ",
  stockValue: "দোকানে মাল",
  itemsCount: "{n}টি জিনিস",
  cashBook: "নগদ",
  upiBook: "UPI",
  moneyIn: "এল",
  moneyOut: "গেল",
  purchases: "মাল কেনা",
  expenses: "খরচ",
  withdrawals: "বাড়ির জন্য",

  closeDay: "দিন বন্ধ করুন",
  closeDaySub: "ক্যাশবাক্স গুনে মেলান",
  expected: "থাকা উচিত",
  howMuch: "ক্যাশবাক্সে কত আছে?",
  save: "সেভ করুন",
  matched: "হিসাব মিলেছে! 🎉",
  short: "{x} কম আছে",
  extra: "{x} বেশি আছে",
  gapHint: "আজকের নগদ এন্ট্রি দেখুন, হয়তো কোনোটা বাদ গেছে:",
  noCashToday: "আজ কোনো নগদ এন্ট্রি নেই।",
  lastClose: "আজ গোনা: {x}",

  stockTitle: "মাল (স্টক)",
  stockSub: "{n}টি জিনিস · {x}-র মাল",
  lowStock: "কম স্টক",
  lowStockAlert: "{n}টি জিনিস ফুরিয়ে আসছে",
  allItems: "সব",
  searchItems: "জিনিস খুঁজুন",
  addItem: "নতুন জিনিস",
  itemName: "নাম",
  itemVariant: "সাইজ / ব্র্যান্ড (ঐচ্ছিক)",
  unit: "একক",
  price: "দাম (₹)",
  inStock: "এখন কত আছে",
  alertAt: "সতর্কতা যখন থাকবে",
  stockIn: "মাল এল",
  stockSold: "বিক্রি হল",
  stockWasted: "নষ্ট",
  stockCount: "গুনে সেট",
  quantity: "পরিমাণ",
  opening: "শুরুর স্টক",
  left: "{n} বাকি",
  close: "বন্ধ করুন",
  saved: "সেভ হয়েছে",

  scanBill: "বিল স্ক্যান",
  scanSub: "সাপ্লায়ারের বিলের ছবি তুলুন, মাল নিজে থেকেই যোগ হবে",
  takePhoto: "ছবি তুলুন",
  fromGallery: "গ্যালারি থেকে বাছুন",
  reading: "বিল পড়ছি…",
  readingFirst: "প্রথমবার একটু সময় লাগবে",
  checkLines: "দেখে টিক দিন",
  notRecognised: "চেনা যায়নি",
  pickItem: "জিনিস বাছুন",
  addToStock: "{n}টি জিনিস স্টকে যোগ করুন",
  scanDone: "{n}টি জিনিসের স্টক বেড়েছে",
  scanEmpty: "বিলে কোনো জিনিস পাওয়া যায়নি। সোজা, পরিষ্কার ছবি তুলুন।",
  scanFailed: "বিল পড়া যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।",
  scanAgain: "আবার স্ক্যান",

  whatIsThis: "এটা কী?",
  listen: "শুনুন",
  gotIt: "বুঝেছি",
  legendIn: "টাকা এল",
  legendOut: "টাকা গেল",
  legendPending: "এখনও বাকি",
  helpExpected: "এখন আপনার ক্যাশবাক্সে এত নগদ থাকা উচিত: শুরুর নগদ, যোগ যা নগদ এল, বাদ যা নগদ গেল। রাতে গুনে মিলিয়ে নিন।",
  helpCapture: "মাইক চাপুন আর কাউন্টারের মতো বলুন, যেমন “শর্মা জি 500 UPI তে দিলেন”। লিখতেও পারেন। আপনি ট্যাপ না করা পর্যন্ত কিছু সেভ হয় না।",
  helpReceivable: "গ্রাহকদের কাছে এখনও যে টাকা পাওনা (ধার)। যেমন রমেশকে ₹350-র জিনিস ধার দিলেন, ₹200 ফেরত এল, তাহলে ₹150 পাওনা।",
  helpPayable: "সাপ্লায়ারকে এখনও যে টাকা দেওয়া বাকি। যেমন ₹3,200-র মাল এল, ₹1,000 দিলেন, তাহলে ₹2,200 দেনা।",
  helpNet: "আপনার আয়: বিক্রি থেকে সেই মালের খরচ, নষ্ট মাল আর খরচ বাদ দিয়ে। কেনা কিন্তু না-বিকোনো মাল ক্ষতি নয়: তা তাকে আছে। বাড়ি নেওয়া টাকা খরচ নয়।",
  helpBooks: "নগদ = ক্যাশবাক্সে নোট আর কয়েন। UPI = ফোন বা ব্যাংকে আসা টাকা। আলাদা রাখলে ফারাক খোঁজা সহজ।",
  helpStock: "প্রতিটি জিনিস তাকে কতটা আছে। মাল এলে + চাপুন, বিক্রি হলে −। কমলা মানে কম আছে, আনিয়ে নিন।",
  helpCloseDay: "দোকান বন্ধের সময় ক্যাশবাক্স গুনে লিখুন। BolKhata জানাবে কম বা বেশি আছে কিনা, আর কোন এন্ট্রি দেখতে হবে।",
  helpScan: "সাপ্লায়ারের বিলের ছবি তুলুন। BolKhata জিনিস আর পরিমাণ পড়বে, আপনি দেখে নিন, এক ট্যাপে সব স্টকে যোগ হবে।",

  howToUse: "কীভাবে ব্যবহার করবেন",
  tourSkip: "এড়িয়ে যান",
  tourNext: "পরবর্তী",
  tourBack: "পিছনে",
  tourDone: "BolKhata ব্যবহার শুরু করুন",
  tourStep: "{i} / {n}",
  tour1Title: "আপনার টাকা, এক নজরে",
  tour1Body: "এই বড় গাঢ় কার্ডটি দেখায় গল্লায় কত নগদ থাকা উচিত। নীল সংখ্যা এসেছে, লাল গেছে।",
  tour2Title: "শুধু বলুন",
  tour2Body: "মাইক চাপুন আর কাউন্টারের মতো বলুন: “রমেশকে 200 ধার”। BolKhata এন্ট্রি বানাবে। আপনি দেখে সেভ করুন।",
  tour3Title: "হিসাব, সহজ ভাষায়",
  tour3Body: "“পাওনা” মানে গ্রাহকরা আপনাকে দেবে। “দেনা” মানে আপনি সাপ্লায়ারকে দেবেন। যেকোনো “?” তে ট্যাপ করুন।",
  tour4Title: "আপনার মাল",
  tour4Body: "তাকে কী আছে আর কী ফুরোচ্ছে, সব দেখা যাবে। সাপ্লায়ারের বিল স্ক্যান করে একবারে স্টক যোগ করুন।",
  tour5Title: "গ্রাহকদের খাতা",
  tour5Body: "প্রত্যেক গ্রাহকের বাকি। কমলা মানে তারিখ পেরিয়েছে: ট্যাপ করে WhatsApp-এ ভদ্রভাবে মনে করিয়ে দিন।",
  tour6Title: "যেখানে খুশি যান",
  tour6Body: "এই পট্টি সবসময় নিচে থাকবে। বড় গোল বোতাম চেপে যেকোনো জায়গা থেকে বলুন।",

  // Shop setup (first run)
  setupTitle: "আপনার দোকান তৈরি করুন",
  setupSub: "কয়েকটা প্রশ্ন, তারপর শুরু। সব পরে বদলাতে পারবেন।",
  setupName: "আপনার দোকানের নাম কী?",
  setupNamePh: "যেমন শর্মা জেনারেল স্টোর",
  setupType: "আপনি কী বিক্রি করেন?",
  typeKirana: "মুদি / জেনারেল স্টোর",
  typeSabzi: "সবজি / ফল",
  typeMedical: "ওষুধের দোকান",
  typeOther: "অন্য কিছু",
  setupMoney: "টাকা",
  setupUpi: "আপনার UPI ID (রিমাইন্ডারে যাবে)",
  setupUpiPh: "যেমন 9876543210@upi",
  setupCash: "এখন ক্যাশবাক্সে কত নগদ আছে (₹)",
  setupStarter: "এই ধরনের দোকানের সাধারণ জিনিস যোগ করুন",
  setupStart: "আমার দোকান খুলুন",
  setupDemo: "শুধু ডেমো দোকান দেখতে চাই",
  setupStep: "ধাপ {i} / {n}",
  optional: "ঐচ্ছিক",
  setPrice: "দাম লিখুন",

  // Entry card (flow 1)
  cardTitle: "দেখে সেভ করুন",
  tSale: "বিক্রি",
  tUdhaar: "ধার",
  tPayment: "টাকা এল",
  tPurchase: "মাল এল",
  tExpense: "খরচ",
  tWithdrawal: "বাড়ির জন্য",
  fAmount: "টাকার পরিমাণ",
  fWho: "কার?",
  fMode: "কীভাবে দিল",
  mCash: "নগদ",
  mUpi: "UPI",
  mUdhaar: "ধার",
  fDue: "কবে পর্যন্ত",
  fItems: "জিনিস",
  fPaidNow: "এখন দিল",
  askAmount: "কত টাকা?",
  askWho: "কার নামে?",

  askWhatSold: "কী বিক্রি হলো? জিনিস আর কতটা, যোগ করুন।",
  didYouMean: "এটা কি?",
  newPerson: "নতুন: {name}",
  saveEntry: "সেভ করুন",
  cancel: "থাক",
  savedToast: "সেভ হয়েছে: {x}",
  undo: "ফিরিয়ে নিন",
  undone: "ফিরিয়ে নেওয়া হল",
  dupAsk: "এই এন্ট্রি এইমাত্র সেভ হয়েছে। আবার সেভ করবেন?",
  saveAgain: "হ্যাঁ, আবার",
  understanding: "বুঝছি…",
  undoMove: "ফেরত",

  // Voice commands and live suggestions
  cKhata: "{name}-এর খাতা খুলুন",
  cReminder: "{name}-কে রিমাইন্ডার",
  cUndo: "শেষ এন্ট্রি ফিরিয়ে নিন",
  trySaying: "এভাবে বলুন",
  undoLastAsk: "ফিরিয়ে নেবেন: {x}?",
  nothingToUndo: "ফেরানোর কিছু নেই",
  sugOwes: "{name}-এর কাছে {x} বাকি · রিমাইন্ডার পাঠান",
  sugLow: "{item} কম আছে · মাল যোগ করুন",
  sayClose: "দিন বন্ধ করো",
  sayStock: "স্টক দেখাও",
  sayScan: "বিল স্ক্যান করো",
  sayHelp: "সাহায্য",

  // Selling from stock (money + stock together)
  saleWorth: "{q} × {p} = {x} বিক্রিতে যোগ হবে",
  attachItem: "+ স্টক থেকে জিনিস যোগ করুন",
  noPriceSale: "দাম নেই, তাই শুধু স্টক কমেছে। টাকা গুনতে দাম লিখুন।",
  // Stock account and smart reorder (stockplan)
  invTitle: "স্টকের খাতা",
  invSub: "গত {n} দিন, কেনা দামে",
  invOpening: "শুরুর স্টক",
  invPurchases: "মাল কেনা",
  invCogs: "বিক্রি মালের খরচ",
  invWastage: "নষ্ট হয়েছে",
  invAdjust: "গণনা ও সংশোধন",
  invClosing: "এখনকার স্টক",
  invSales: "এত টাকায় বিক্রি",
  invProfit: "মোট লাভ",
  invMargin: "মার্জিন {x}%",
  invNoCost: "{n}টি জিনিসের কেনা দাম লেখা নেই, তাই ₹0 ধরা হয়েছে। জিনিসটি খুলে কেনা দাম লিখুন।",
  helpInvAccount: "স্টক মানে তাকে রাখা টাকা। শুরু + কেনা − বিক্রি মালের খরচ − নষ্ট = এখনকার স্টক। যেমন: ₹10,000 + ₹3,000 − ₹2,500 − ₹100 = ₹10,400।",
  helpProfit: "বিক্রির দাম বাদ কেনার দাম। যেমন: ম্যাগি ₹12-এ কিনে ₹15-এ বেচলে → প্রতিটিতে ₹3 লাভ। ভাড়া আর বিল এখানে বাদ যায় না।",
  planTitle: "স্মার্ট অর্ডার",
  planSub: "{n} দিনের বিক্রি থেকে · সাপ্লায়ার {d} দিন নেয়",
  planLead: "সাপ্লায়ারের দিন",
  planOrderNow: "এখনই আনান",
  planOut: "শেষ",
  planDead: "বিক্রি হচ্ছে না",
  planOk: "যথেষ্ট",
  planPerDay: "{x} {u}/দিন",
  planNoSale: "এখনও বিক্রি নেই",
  planDaysLeft: "{d} দিন বাকি",
  planReorderAt: "{q}-এ আনান",
  planOrder: "{q} {u} আনান",
  planDeadMoney: "{x} না-বিকোনো মালে আটকে আছে",
  planApply: "অ্যালার্ট রিঅর্ডার পয়েন্টে দিন",
  planApplied: "{n}টি অ্যালার্ট বদলেছে",
  planEmpty: "কিছু মাল বেচুন বা স্টক ঢোকান, তারপর পরামর্শ এখানে দেখাবে।",
  helpPlan: "প্রতিটি জিনিস কত তাড়াতাড়ি বিকোয় আর সাপ্লায়ার কত দিন নেয় আমরা দেখি। স্টক রিঅর্ডার পয়েন্টে এলে বলা পরিমাণ আনান, যাতে শেষ না হয়। A = সবচেয়ে বেশি টাকা আনা জিনিস: এগুলো কখনও শেষ হতে দেবেন না।",
  abcA: "সবচেয়ে বেশি বিকোয়",
  showAll: "সব {n} দেখান",
  showLess: "কম দেখান",
  costPrice: "কেনা দাম",
  marginEach: "প্রতি {u}-এ {x} আয়",
  setCost: "খরচ লিখুন",
  noStockYet: "স্টকে এখনও কোনো জিনিস নেই। জিনিস যোগ করুন, যাতে বিক্রি করলে স্টক নিজে কমে।",
  newItem: "+ নতুন জিনিস",
  notInStockAdd: "স্টকে নেই · যোগ করুন",

  whichItem: "কোনটা?",


  inStockQty: "স্টকে: {qty}",


  onlyInStock: "স্টকে শুধু {qty}",


  shortStockAsk: "এত স্টক নেই। তবুও সেভ করবেন?",


  saveAnyway: "তবুও সেভ করুন",


  stockAnswer: "{item}: {qty} বাকি",



  sellsFor: "বিক্রির দাম (₹)",



  youPay: "কেনার দাম (₹)",



  askCost: "{item} কত দিয়ে কিনলেন, প্রতি {unit}?",



  askSellPrice: "{item} কত দিয়ে বিক্রি করেন, প্রতি {unit}?",



  useItemsTotal: "জিনিসের মোট {x}। সেটাই নেবেন?",



  shelfLife: "কত দিন ভালো থাকে",



  shelfDays: "কয়েক দিন",



  shelfMonths: "১–৩ মাস",



  shelfLong: "৬+ মাস",



  shelfNone: "নষ্ট হয় না",



  spoilage: "এই মাসে নষ্ট হওয়ার আন্দাজ",



  helpSpoilage: "যে মাল নষ্ট হয় তার দাম কমে যায়। প্রতিটি জিনিস কত দিন ভালো থাকে তা থেকে আন্দাজ করি, যাতে লাভ বেশি না দেখায়। যেমন: ₹১,০০০ এর দুধ, যা কয়েক দিনে নষ্ট হয়, মাসে প্রায় ₹২০০ ক্ষতি।",



  spoilTitle: "নষ্ট মাল দেখুন",



  spoilCheck: "{item}: {days} দিন আগে কেনা। নষ্ট হলে অপচয় হিসেবে লিখুন।",
  // Numbers must add up before saving
  totalMustMatch: "জিনিসের যোগফল {x}, কিন্তু টাকা {y}। দুটো সমান হতে হবে: দাম বা পরিমাণ ঠিক করুন, বা {x} নিন।",
  shortStockBlock: "পরিমাণ কমান, বা আগে আসা মাল লিখুন।",
  overpayCustomer: "{name}-এর মাত্র {x} বাকি। পেমেন্ট তার বেশি হতে পারে না।",
  overpaySupplier: "আপনি {name}-কে মাত্র {x} দেবেন। তার বেশি দিতে পারবেন না।",
  owesNothing: "খাতায় {name}-এর কিছু বাকি নেই। আগে পুরনো ধার লিখুন।",
  // Settle up from a person's khata
  settleCustomer: "{name}-এর থেকে টাকা পেলাম",
  settleSupplier: "{name}-কে টাকা দিলাম",
  gotBtn: "{x} পেলাম",
  paidBtn: "{x} দিলাম",

  handsFree: "হাত ছাড়া",
  handsFreeHint: "“BolKhata” বলুন, তারপর আপনার এন্ট্রি",
  handsFreeOff: "হাত ছাড়া মোড বন্ধ",
};
