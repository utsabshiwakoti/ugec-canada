export const BOOKING = [
  { key: 'educational', label: 'Educational Consultation', price: 'Free', form: 'educational', blurb: 'Discuss PR-leading courses, programs and colleges', submit: 'Book Educational Consultation' },
  { key: 'immigration', label: 'Immigration Consultation', price: 'Paid', form: 'immigration', blurb: 'With a Regulated Canadian Immigration Consultant (RCIC)', submit: 'Send intake details' },
];

export const DISCLAIMER = 'UGEC Canada is an education consultancy. Program information, tuition, admission requirements, intakes and availability are subject to change and should be confirmed with the educational institution. UGEC does not guarantee admission, visas, work permits, permanent residence or employment. Regulated immigration advice, where required, is provided by an appropriately authorized professional.';

export const LEGAL = { privacy: 'Privacy Policy', terms: 'Terms & Conditions', cookies: 'Cookie Policy', disclaimer: 'Disclaimer', accessibility: 'Accessibility' };

export const NAV = [['/', 'Home'], ['Already in Canada', [['/pr-leading-courses', 'PR-Leading Courses'], ['/educational-assistance', 'Educational Assistance']]], ['/immigration-assistance', 'Immigration Assistance'], ['/partner-with-us', 'Partner With Us'], ['/blog', 'Blog / Updates'], ['/contact', 'Contact Us'], ['/about', 'About Us']];
export const NAV_LINKS = NAV.flatMap(([a, b]) => (Array.isArray(b) ? b : [[a, b]]));

export const TITLES = { '/': 'UGEC Canada | Education & Career Opportunities in Canada', '/about': 'About UGEC Canada', '/pr-leading-courses': 'PR-Leading Courses in Canada | UGEC Canada', '/educational-assistance': 'Educational Assistance: Study Permit Pathways | UGEC Canada', '/immigration-assistance': 'Professional Immigration Assistance | UGEC Canada', '/book-consultation': 'Book a Consultation | UGEC Canada', '/partner-with-us': 'Partner With UGEC Canada', '/blog': 'Blog & Updates | UGEC Canada', '/contact': 'Contact UGEC Canada', '/referral-portal': 'Referral partner portal | UGEC Canada' };

export const ALIASES = { '/already-in-canada': '/pr-leading-courses', '/study-in-canada': '/pr-leading-courses', '/educational-consultation': '/book-consultation?type=educational', '/immigration-consultation': '/book-consultation?type=immigration' };
