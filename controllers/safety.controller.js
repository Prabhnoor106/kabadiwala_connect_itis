/**
 * Safety Controller
 * Serves pictorial/audio safety guidance keyed by material category and language.
 * Content is static for the MVP — no database table needed.
 */
const { success, error } = require('../utils/response');
const { PREFERRED_LANGUAGE } = require('../config/constants');

/**
 * Safety guidance content keyed by category code and language.
 * In production, this would come from a CMS or database.
 */
const SAFETY_CONTENT = {
  BAT: {
    hi: {
      title: 'बैटरी सुरक्षा',
      warnings: ['बैटरी न जलाएं', 'बच्चों से दूर रखें', 'लीक होने पर हाथ न लगाएं'],
      icon: '🔋',
      handling_steps: ['दस्ताने पहनें', 'हवादार जगह पर रखें', 'अलग बैग में रखें'],
    },
    mr: {
      title: 'बॅटरी सुरक्षा',
      warnings: ['बॅटरी जाळू नका', 'मुलांपासून दूर ठेवा', 'गळती झाल्यास हात लावू नका'],
      icon: '🔋',
      handling_steps: ['हातमोजे घाला', 'हवेशीर जागी ठेवा', 'वेगळ्या पिशवीत ठेवा'],
    },
    en: {
      title: 'Battery Safety',
      warnings: ['Do not burn batteries', 'Keep away from children', 'Do not touch leaking batteries'],
      icon: '🔋',
      handling_steps: ['Wear gloves', 'Store in ventilated area', 'Keep in separate bag'],
    },
  },
  CRT: {
    hi: {
      title: 'CRT मॉनिटर सुरक्षा',
      warnings: ['तोड़ें नहीं — अंदर सीसा है', 'गिराएं नहीं — फट सकता है', 'धूल न सूंघें'],
      icon: '📺',
      handling_steps: ['सावधानी से उठाएं', 'बंद बॉक्स में रखें', 'तोड़ने की कोशिश न करें'],
    },
    mr: {
      title: 'CRT मॉनिटर सुरक्षा',
      warnings: ['तोडू नका — आत शिसे आहे', 'पाडू नका — फुटू शकते', 'धूळ श्वास घेऊ नका'],
      icon: '📺',
      handling_steps: ['काळजीपूर्वक उचला', 'बंद बॉक्समध्ये ठेवा', 'तोडण्याचा प्रयत्न करू नका'],
    },
    en: {
      title: 'CRT Monitor Safety',
      warnings: ['Do not break — contains lead', 'Do not drop — can implode', 'Do not inhale dust'],
      icon: '📺',
      handling_steps: ['Lift carefully', 'Keep in closed box', 'Do not attempt to dismantle'],
    },
  },
  PCB: {
    hi: {
      title: 'सर्किट बोर्ड सुरक्षा',
      warnings: ['न जलाएं — जहरीला धुआं निकलता है', 'तेज धार से बचें', 'हाथ धोएं बाद में'],
      icon: '🔌',
      handling_steps: ['दस्ताने पहनें', 'अलग बैग में रखें', 'काम के बाद हाथ धोएं'],
    },
    mr: {
      title: 'सर्किट बोर्ड सुरक्षा',
      warnings: ['जाळू नका — विषारी धूर निघतो', 'तीक्ष्ण कडांपासून सावध', 'नंतर हात धुवा'],
      icon: '🔌',
      handling_steps: ['हातमोजे घाला', 'वेगळ्या पिशवीत ठेवा', 'कामानंतर हात धुवा'],
    },
    en: {
      title: 'Circuit Board Safety',
      warnings: ['Do not burn — releases toxic fumes', 'Watch for sharp edges', 'Wash hands after handling'],
      icon: '🔌',
      handling_steps: ['Wear gloves', 'Keep in separate bag', 'Wash hands after work'],
    },
  },
  CBL: {
    hi: {
      title: 'तार/केबल सुरक्षा',
      warnings: ['जलाकर तांबा न निकालें', 'बिजली के तार की जांच करें'],
      icon: '🔗',
      handling_steps: ['काटने के लिए उचित औजार इस्तेमाल करें', 'बंडल बनाकर रखें'],
    },
    mr: {
      title: 'वायर/केबल सुरक्षा',
      warnings: ['जाळून तांबे काढू नका', 'विजेच्या तारांची तपासणी करा'],
      icon: '🔗',
      handling_steps: ['कापण्यासाठी योग्य साधने वापरा', 'बंडल करून ठेवा'],
    },
    en: {
      title: 'Wire/Cable Safety',
      warnings: ['Do not burn to extract copper', 'Check for live wires'],
      icon: '🔗',
      handling_steps: ['Use proper cutting tools', 'Bundle and store neatly'],
    },
  },
};

/**
 * GET /safety/guidance
 * Get safety guidance for a material category.
 * Query: ?category_code=<string>&lang=<hi|mr|en>
 */
async function getGuidance(req, res, next) {
  try {
    const { category_code, lang } = req.query;

    if (!category_code) {
      // Return all available categories with their icons
      const available = Object.entries(SAFETY_CONTENT).map(([code, langs]) => ({
        code,
        icon: langs.en.icon,
        title_en: langs.en.title,
      }));

      return success(res, { data: available });
    }

    const categoryContent = SAFETY_CONTENT[category_code.toUpperCase()];
    if (!categoryContent) {
      return error(res, {
        message: `No safety guidance available for category '${category_code}'`,
        statusCode: 404,
      });
    }

    const language = lang && Object.values(PREFERRED_LANGUAGE).includes(lang) ? lang : 'hi';
    const content = categoryContent[language] || categoryContent.en;

    return success(res, { data: content });
  } catch (err) {
    next(err);
  }
}

module.exports = { getGuidance };
