import { t } from '../core/tpl.js';
import { formView } from '../components/form.js';

export const partner = () => t('pages/partner', { form: formView('partner', {}, 'Partner With UGEC') });
