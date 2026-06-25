// Copyright (c) 2026 ITLR Assets. All rights reserved.
// Single source of truth for age-group YOB boundaries and experience tier thresholds.
// Works in Node.js (require) and browser (<script src>).

const AGE_GROUPS = [
  { key: 'MaleSchools', yobMin: 2012, yobMax: 2014, label: 'Schools' },
  { key: 'MaleJunior',  yobMin: 2010, yobMax: 2011, label: 'Junior'  },
  { key: 'MaleYouth',   yobMin: 2008, yobMax: 2009, label: 'Youth'   },
  { key: 'MaleSenior',  yobMin: null, yobMax: 2007, label: 'Senior'  },
];

const EXPERIENCE_TIERS = [
  { key: 'Novice',      min: 0,  max: 5,        display: '0-5'  },
  { key: 'Experienced', min: 6,  max: 10,       display: '6-10' },
  { key: 'OpenClass',   min: 11, max: Infinity, display: '11+'  },
];

const SENIOR_YOB_MAX      = 2007; // yob <= this → Senior
const R5_ELIGIBLE_YOB_MIN = 2010; // male yob >= this → Schools/Junior → R5-eligible

if (typeof module !== 'undefined') {
  module.exports = { AGE_GROUPS, EXPERIENCE_TIERS, SENIOR_YOB_MAX, R5_ELIGIBLE_YOB_MIN };
}
