import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './locales/tr.json';

void i18next.use(initReactI18next).init({
  lng: 'tr',
  fallbackLng: 'tr',
  resources: { tr: { translation: tr } },
  interpolation: { escapeValue: false },
});
