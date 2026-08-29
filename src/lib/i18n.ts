import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// i18n roadmap (audit: only Dashboard + Auth were translated, leaving the
// language toggle half-coherent). This pass covers every LAYOUT-LEVEL string —
// sidebar navigation, settings entry and sign out — so the app chrome follows
// the selected language everywhere. Page bodies (forms, tables, toasts) remain
// English; translating them is tracked as incremental `page.*` batches.
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
      "common.signout": "Sign Out",
      "nav.dashboard": "Dashboard",
      "nav.products": "Products",
      "nav.batches": "Batches",
      "nav.transfer": "Transfer",
      "nav.qr_codes": "QR Codes",
      "nav.supply_chain": "Supply Chain",
      "nav.alerts": "Alerts",
      "nav.fraud_alerts": "Fraud Alerts",
      "nav.scan_update": "Scan & Update",
      "nav.verify_product": "Verify Product",
      "nav.my_products": "My Products",
      "nav.users": "Users",
      "nav.analytics": "Analytics",
      "nav.audit_logs": "Audit Logs",
      "nav.settings": "Settings",
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
      "common.signout": "साइन आउट",
      "nav.dashboard": "डैशबोर्ड",
      "nav.products": "उत्पाद",
      "nav.batches": "बैच",
      "nav.transfer": "ट्रांसफर",
      "nav.qr_codes": "QR कोड",
      "nav.supply_chain": "आपूर्ति शृंखला",
      "nav.alerts": "अलर्ट",
      "nav.fraud_alerts": "धोखाधड़ी अलर्ट",
      "nav.scan_update": "स्कैन और अपडेट",
      "nav.verify_product": "उत्पाद सत्यापित करें",
      "nav.my_products": "मेरे उत्पाद",
      "nav.users": "उपयोगकर्ता",
      "nav.analytics": "विश्लेषण",
      "nav.audit_logs": "ऑडिट लॉग",
      "nav.settings": "सेटिंग्स",
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
