export const BOOKING = [
  { key: 'educational', label: 'Educational consultation', price: 'Free', form: 'educational', blurb: 'Programs, colleges, provinces and budgets', submit: 'Book Educational Consultation' },
  { key: 'already', label: 'Already in Canada', price: 'Free', form: 'already', blurb: 'Next steps for students and residents here now', submit: 'Book Consultation' },
  { key: 'trades', label: 'Skilled trades', price: 'Free', form: 'trades', blurb: 'Gas, HVAC, plumbing, carpentry, welding', submit: 'Book Consultation' },
  { key: 'immigration', label: 'Immigration consultation', price: 'Paid', form: 'immigration', blurb: 'With an authorized immigration professional', submit: 'Send intake details' },
];

export const DISCLAIMER = 'UGEC Canada is an education consultancy. Program information, tuition, admission requirements, intakes and availability are subject to change and should be confirmed with the educational institution. UGEC does not guarantee admission, visas, work permits, permanent residence or employment. Regulated immigration advice, where required, is provided by an appropriately authorized professional.';

export const LEGAL = { privacy: 'Privacy Policy', terms: 'Terms & Conditions', cookies: 'Cookie Policy', disclaimer: 'Disclaimer', accessibility: 'Accessibility' };

export const NAV = [['/', 'Home'], ['/already-in-canada', 'Already in Canada'], ['/partner-with-us', 'Partner With Us'], ['/blog', 'Blog / Updates'], ['/contact', 'Contact Us'], ['/about', 'About Us']];

export const TITLES = { '/': 'UGEC Canada | Education & Career Opportunities in Canada', '/about': 'About UGEC Canada', '/already-in-canada': 'Already in Canada? Programs & Next Steps | UGEC Canada', '/book-consultation': 'Book a Consultation | UGEC Canada', '/partner-with-us': 'Partner With UGEC Canada', '/blog': 'Blog & Updates | UGEC Canada', '/contact': 'Contact UGEC Canada', '/referral-portal': 'Referral partner portal | UGEC Canada' };

export const ALIASES = { '/study-in-canada': '/already-in-canada', '/educational-consultation': '/book-consultation?type=educational', '/immigration-consultation': '/book-consultation?type=immigration' };
