import { t } from '../core/tpl.js';
import { formView } from '../components/form.js';

export const contact = () => t('pages/contact', { form: formView('general', {}, 'Send message') });
