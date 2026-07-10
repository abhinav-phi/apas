import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      "dashboard.welcome": "Welcome back",
      "dashboard.metrics": "Overview Metrics",
      "dashboard.manufacturer": "Manufacturer",
      "dashboard.supplier": "Supplier",
      "dashboard.customer": "Customer",
      "verify.title": "Verify Product",
      "verify.subtitle": "Scan QR or enter code to verify authenticity",
      "auth.signin": "Sign In",
      "auth.signup": "Sign Up",
      "auth.create_account": "Create Account",
      "auth.welcome_back": "Welcome Back",
      "auth.get_started": "Get Started",
      "auth.already_have_account": "Already have an account?",
      "auth.dont_have_account": "Don't have an account?",
      "common.loading": "Loading...",
    }
  },
  hi: {
    translation: {
      "dashboard.welcome": "वापसी पर स्वागत है",
      "dashboard.metrics": "अवलोकन मेट्रिक्स",
      "dashboard.manufacturer": "निर्माता",
      "dashboard.supplier": "आपूर्तिकर्ता",
      "dashboard.customer": "ग्राहक",
      "verify.title": "उत्पाद सत्यापित करें",
      "verify.subtitle": "प्रमाणिकता सत्यापित करने के लिए QR स्कैन करें या कोड दर्ज करें",
      "auth.signin": "साइन इन करें",
      "auth.signup": "साइन अप करें",
      "auth.create_account": "खाता बनाएं",
      "auth.welcome_back": "वापसी पर स्वागत है",
      "auth.get_started": "शुरू करें",
      "auth.already_have_account": "क्या आपके पास पहले से खाता है?",
      "auth.dont_have_account": "खाता नहीं है?",
      "common.loading": "लोड हो रहा है...",
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "en",
    fallbackLng: "en",
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
