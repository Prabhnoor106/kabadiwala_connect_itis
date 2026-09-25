/**
 * Translations for Hindi, Marathi and English.
 *
 * Hindi is the default because it is the primary language of the collectors this
 * platform is built for. Strings stay short and concrete — no jargon, no long
 * sentences — because many users read slowly or rely on the icon beside the label.
 */

export const LANGUAGES = [
  { code: 'hi', label: 'हिंदी', english: 'Hindi' },
  { code: 'mr', label: 'मराठी', english: 'Marathi' },
  { code: 'en', label: 'English', english: 'English' },
];

const dict = {
  // ---------- Navigation ----------
  'nav.home': { hi: 'होम', mr: 'होम', en: 'Home' },
  'nav.prices': { hi: 'भाव', mr: 'दर', en: 'Prices' },
  'nav.addLot': { hi: 'माल जोड़ें', mr: 'माल जोडा', en: 'Add lot' },
  'nav.lots': { hi: 'मेरा माल', mr: 'माझा माल', en: 'My lots' },
  'nav.earnings': { hi: 'कमाई', mr: 'कमाई', en: 'Earnings' },
  'nav.safety': { hi: 'सुरक्षा', mr: 'सुरक्षा', en: 'Safety' },
  'nav.dashboard': { hi: 'डैशबोर्ड', mr: 'डॅशबोर्ड', en: 'Dashboard' },
  'nav.incoming': { hi: 'नए अनुरोध', mr: 'नवीन विनंत्या', en: 'Incoming' },
  'nav.rates': { hi: 'मेरे रेट', mr: 'माझे दर', en: 'My rates' },
  'nav.profile': { hi: 'प्रोफ़ाइल', mr: 'प्रोफाइल', en: 'Profile' },
  'nav.logout': { hi: 'लॉग आउट', mr: 'लॉग आउट', en: 'Log out' },

  // ---------- Auth ----------
  'auth.title': { hi: 'कबाड़ीवाला कनेक्ट', mr: 'कबाडीवाला कनेक्ट', en: 'Kabadiwala Connect' },
  'auth.tagline': {
    hi: 'सही भाव, अधिकृत रीसाइक्लर, पक्की रसीद',
    mr: 'योग्य दर, अधिकृत रिसायकलर, पक्की पावती',
    en: 'Fair prices, authorized recyclers, proof of every handover',
  },
  'auth.phone': { hi: 'मोबाइल नंबर', mr: 'मोबाइल नंबर', en: 'Mobile number' },
  'auth.sendOtp': { hi: 'OTP भेजें', mr: 'OTP पाठवा', en: 'Send OTP' },
  'auth.otp': { hi: 'OTP डालें', mr: 'OTP टाका', en: 'Enter OTP' },
  'auth.verify': { hi: 'आगे बढ़ें', mr: 'पुढे जा', en: 'Continue' },
  'auth.pin': { hi: 'पिन', mr: 'पिन', en: 'PIN' },
  'auth.usePin': { hi: 'पिन से लॉगिन करें', mr: 'पिन ने लॉगिन करा', en: 'Log in with PIN' },
  'auth.useOtp': { hi: 'OTP से लॉगिन करें', mr: 'OTP ने लॉगिन करा', en: 'Log in with OTP' },
  'auth.resend': { hi: 'दोबारा भेजें', mr: 'पुन्हा पाठवा', en: 'Resend' },
  'auth.changeNumber': { hi: 'नंबर बदलें', mr: 'नंबर बदला', en: 'Change number' },
  'auth.collector': { hi: 'कबाड़ीवाला', mr: 'कबाडीवाला', en: 'Collector' },
  'auth.recycler': { hi: 'रीसाइक्लर', mr: 'रिसायकलर', en: 'Recycler' },
  'auth.admin': { hi: 'एडमिन', mr: 'अ‍ॅडमिन', en: 'Admin' },
  'auth.email': { hi: 'ईमेल', mr: 'ईमेल', en: 'Email' },
  'auth.password': { hi: 'पासवर्ड', mr: 'पासवर्ड', en: 'Password' },
  'auth.login': { hi: 'लॉगिन', mr: 'लॉगिन', en: 'Log in' },
  'auth.register': { hi: 'नया खाता', mr: 'नवीन खाते', en: 'Register' },

  // ---------- Prices ----------
  'price.board': { hi: 'आज के भाव', mr: 'आजचे दर', en: "Today's rates" },
  'price.perKg': { hi: 'प्रति किलो', mr: 'प्रति किलो', en: 'per kg' },
  'price.up': { hi: 'भाव बढ़ा', mr: 'दर वाढला', en: 'Rate up' },
  'price.down': { hi: 'भाव घटा', mr: 'दर घटला', en: 'Rate down' },
  'price.stable': { hi: 'भाव स्थिर', mr: 'दर स्थिर', en: 'Rate steady' },
  'price.range': { hi: 'बाज़ार भाव', mr: 'बाजार दर', en: 'Market range' },
  'price.best': { hi: 'सबसे अच्छा भाव', mr: 'सर्वोत्तम दर', en: 'Best offer' },
  'price.listen': { hi: 'भाव सुनें', mr: 'दर ऐका', en: 'Listen to rate' },
  'price.trend30': { hi: '30 दिन का भाव', mr: '30 दिवसांचे दर', en: '30-day trend' },
  'price.updated': { hi: 'अपडेट हुआ', mr: 'अपडेट झाले', en: 'Updated' },

  // ---------- Lots ----------
  'lot.new': { hi: 'नया माल जोड़ें', mr: 'नवीन माल जोडा', en: 'Add a new lot' },
  'lot.photo': { hi: 'फोटो लें', mr: 'फोटो घ्या', en: 'Take a photo' },
  'lot.retake': { hi: 'दोबारा फोटो', mr: 'पुन्हा फोटो', en: 'Retake photo' },
  'lot.material': { hi: 'माल चुनें', mr: 'माल निवडा', en: 'Choose material' },
  'lot.subMaterial': { hi: 'किस्म', mr: 'प्रकार', en: 'Type' },
  'lot.weight': { hi: 'वज़न (किलो)', mr: 'वजन (किलो)', en: 'Weight (kg)' },
  'lot.condition': { hi: 'हालत', mr: 'स्थिती', en: 'Condition' },
  'lot.source': { hi: 'कहाँ से मिला', mr: 'कुठून मिळाले', en: 'Source' },
  'lot.location': { hi: 'जगह', mr: 'ठिकाण', en: 'Location' },
  'lot.address': { hi: 'पता', mr: 'पत्ता', en: 'Address' },
  'lot.notes': { hi: 'कुछ और', mr: 'अजून काही', en: 'Notes' },
  'lot.estimate': { hi: 'अनुमानित कीमत', mr: 'अंदाजे किंमत', en: 'Estimated value' },
  'lot.save': { hi: 'माल सेव करें', mr: 'माल सेव्ह करा', en: 'Save lot' },
  'lot.findRecyclers': { hi: 'रीसाइक्लर देखें', mr: 'रिसायकलर पहा', en: 'Find recyclers' },
  'lot.myLots': { hi: 'मेरा माल', mr: 'माझा माल', en: 'My lots' },
  'lot.timeline': { hi: 'माल का सफ़र', mr: 'मालाचा प्रवास', en: 'Lot journey' },
  'lot.useMyLocation': { hi: 'मेरी जगह लें', mr: 'माझे ठिकाण घ्या', en: 'Use my location' },

  // ---------- Condition ----------
  'condition.working': { hi: 'चालू', mr: 'चालू', en: 'Working' },
  'condition.non_working': { hi: 'बंद', mr: 'बंद', en: 'Not working' },
  'condition.damaged': { hi: 'टूटा', mr: 'तुटलेले', en: 'Damaged' },
  'condition.mixed': { hi: 'मिला-जुला', mr: 'मिश्र', en: 'Mixed' },

  // ---------- Source ----------
  'source.household': { hi: 'घर', mr: 'घर', en: 'Household' },
  'source.commercial': { hi: 'दुकान/ऑफिस', mr: 'दुकान/ऑफिस', en: 'Commercial' },
  'source.industrial': { hi: 'फैक्ट्री', mr: 'कारखाना', en: 'Industrial' },
  'source.institutional': { hi: 'स्कूल/अस्पताल', mr: 'शाळा/रुग्णालय', en: 'Institutional' },

  // ---------- Recyclers ----------
  'recycler.authorized': { hi: 'सरकारी मान्यता', mr: 'सरकारी मान्यता', en: 'CPCB authorized' },
  'recycler.pickup': { hi: 'लेने आएंगे', mr: 'घेण्यास येतील', en: 'Pickup available' },
  'recycler.dropOff': { hi: 'खुद पहुँचाना है', mr: 'स्वतः पोहोचवावे', en: 'Drop-off only' },
  'recycler.away': { hi: 'दूर', mr: 'दूर', en: 'away' },
  'recycler.youGet': { hi: 'आपको मिलेंगे', mr: 'तुम्हाला मिळतील', en: 'You get' },
  'recycler.request': { hi: 'यही चुनें', mr: 'हेच निवडा', en: 'Request pickup' },
  'recycler.compare': { hi: 'तुलना करें', mr: 'तुलना करा', en: 'Compare' },
  'recycler.bestMatch': { hi: 'सबसे अच्छा', mr: 'सर्वोत्तम', en: 'Best match' },
  'recycler.call': { hi: 'फ़ोन करें', mr: 'फोन करा', en: 'Call' },

  // ---------- Transactions ----------
  'tx.status.quoted': { hi: 'भाव भेजा', mr: 'दर पाठवला', en: 'Quoted' },
  'tx.status.accepted': { hi: 'मंज़ूर', mr: 'मंजूर', en: 'Accepted' },
  'tx.status.in_transit': { hi: 'रास्ते में', mr: 'वाटेत', en: 'In transit' },
  'tx.status.handed_over': { hi: 'माल दिया', mr: 'माल दिला', en: 'Handed over' },
  'tx.status.confirmed': { hi: 'पुष्टि हुई', mr: 'पुष्टी झाली', en: 'Confirmed' },
  'tx.status.completed': { hi: 'पूरा हुआ', mr: 'पूर्ण झाले', en: 'Completed' },
  'tx.status.cancelled': { hi: 'रद्द', mr: 'रद्द', en: 'Cancelled' },
  'tx.status.disputed': { hi: 'विवाद', mr: 'वाद', en: 'Disputed' },
  'tx.myDeals': { hi: 'मेरे सौदे', mr: 'माझे सौदे', en: 'My deals' },
  'tx.handover': { hi: 'माल सौंपें', mr: 'माल सुपूर्द करा', en: 'Record handover' },
  'tx.actualWeight': { hi: 'असली वज़न', mr: 'खरे वजन', en: 'Actual weight' },
  'tx.reference': { hi: 'रसीद नंबर', mr: 'पावती क्रमांक', en: 'Reference number' },
  'tx.accept': { hi: 'स्वीकारें', mr: 'स्वीकारा', en: 'Accept' },
  'tx.reject': { hi: 'मना करें', mr: 'नकार द्या', en: 'Reject' },
  'tx.confirm': { hi: 'पुष्टि करें', mr: 'पुष्टी करा', en: 'Confirm' },
  'tx.markPaid': { hi: 'पैसा दिया', mr: 'पैसे दिले', en: 'Mark paid' },

  // ---------- Earnings ----------
  'earn.total': { hi: 'कुल कमाई', mr: 'एकूण कमाई', en: 'Total earnings' },
  'earn.thisMonth': { hi: 'इस महीने', mr: 'या महिन्यात', en: 'This month' },
  'earn.pending': { hi: 'बाकी पैसा', mr: 'बाकी पैसे', en: 'Pending dues' },
  'earn.paid': { hi: 'मिल गया', mr: 'मिळाले', en: 'Received' },
  'earn.ledger': { hi: 'हिसाब', mr: 'हिशोब', en: 'Ledger' },
  'earn.deals': { hi: 'सौदे', mr: 'सौदे', en: 'Deals' },

  // ---------- Safety ----------
  'safety.title': { hi: 'सुरक्षा जानकारी', mr: 'सुरक्षा माहिती', en: 'Safety guidance' },
  'safety.warnings': { hi: 'ये न करें', mr: 'हे करू नका', en: 'Do not' },
  'safety.steps': { hi: 'ऐसे करें', mr: 'असे करा', en: 'Safe handling' },
  'safety.listen': { hi: 'सुनें', mr: 'ऐका', en: 'Listen' },

  // ---------- Common ----------
  'common.loading': { hi: 'लोड हो रहा है…', mr: 'लोड होत आहे…', en: 'Loading…' },
  'common.error': { hi: 'कुछ गड़बड़ हुई', mr: 'काहीतरी चूक झाली', en: 'Something went wrong' },
  'common.retry': { hi: 'दोबारा कोशिश करें', mr: 'पुन्हा प्रयत्न करा', en: 'Try again' },
  'common.empty': { hi: 'अभी कुछ नहीं', mr: 'सध्या काही नाही', en: 'Nothing here yet' },
  'common.save': { hi: 'सेव करें', mr: 'सेव्ह करा', en: 'Save' },
  'common.cancel': { hi: 'रद्द करें', mr: 'रद्द करा', en: 'Cancel' },
  'common.close': { hi: 'बंद करें', mr: 'बंद करा', en: 'Close' },
  'common.back': { hi: 'पीछे', mr: 'मागे', en: 'Back' },
  'common.next': { hi: 'आगे', mr: 'पुढे', en: 'Next' },
  'common.search': { hi: 'खोजें', mr: 'शोधा', en: 'Search' },
  'common.viewAll': { hi: 'सब देखें', mr: 'सर्व पहा', en: 'View all' },
  'common.optional': { hi: 'ज़रूरी नहीं', mr: 'आवश्यक नाही', en: 'optional' },
  'common.required': { hi: 'ज़रूरी', mr: 'आवश्यक', en: 'required' },
  'common.offline': {
    hi: 'इंटरनेट नहीं है — बाद में सेव होगा',
    mr: 'इंटरनेट नाही — नंतर सेव्ह होईल',
    en: 'Offline — will sync when connected',
  },
};

/**
 * Look up a key. Falls back to the English string, then to the key itself, so a
 * missing translation never renders as blank space.
 */
export function t(key, lang = 'hi') {
  const entry = dict[key];
  if (!entry) return key;
  return entry[lang] || entry.en || key;
}

/** Bound translator: const tr = translator('mr'); tr('nav.home') */
export function translator(lang) {
  return (key) => t(key, lang);
}

export default dict;
