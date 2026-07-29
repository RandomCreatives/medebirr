/**
 * Server-side validation utilities
 * All regexes are anchored to prevent bypass via newlines etc.
 */

// Ethiopian phone regex: +2519XXXXXXXX, +2517XXXXXXXX, 09XXXXXXXX, 07XXXXXXXX
// Normalized to +2519XXXXXXXX format
const PHONE_REGEX = /^(\+251|0)(9|7)\d{8}$/;

// Name regex: letters only (Amharic, English), spaces, hyphens, apostrophes
// Allows: "Abebe Kebede", "አበበ ከበደ", "Jean-Pierre", "O'Connor"
const NAME_REGEX = /^[\p{L}\s\-']+$/u;

// Simple email regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sanitize: trim and collapse internal whitespace
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/\s+/g, ' ');
}

// Validate Ethiopian phone number
function validatePhone(phone) {
  const clean = sanitizeString(phone);
  if (!clean) return { valid: false, error: 'Phone number is required' };
  if (!PHONE_REGEX.test(clean)) {
    return { valid: false, error: 'Invalid Ethiopian phone number. Use +2519XXXXXXXX, +2517XXXXXXXX, 09XXXXXXXX, or 07XXXXXXXX' };
  }
  // Normalize to +2519XXXXXXXX
  let normalized = clean;
  if (normalized.startsWith('0')) {
    normalized = '+251' + normalized.slice(1);
  } else if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }
  return { valid: true, normalized };
}

// Validate name (first/last/full)
function validateName(name, fieldName = 'Name') {
  const clean = sanitizeString(name);
  if (!clean) return { valid: false, error: `${fieldName} is required` };
  if (clean.length < 2) return { valid: false, error: `${fieldName} must be at least 2 characters` };
  if (clean.length > 100) return { valid: false, error: `${fieldName} must be at most 100 characters` };
  if (!NAME_REGEX.test(clean)) {
    return { valid: false, error: `${fieldName} can only contain letters, spaces, hyphens, and apostrophes` };
  }
  return { valid: true, normalized: clean };
}

// Validate email
function validateEmail(email) {
  const clean = sanitizeString(email);
  if (!clean) return { valid: false, error: 'Email is required' };
  if (!EMAIL_REGEX.test(clean)) return { valid: false, error: 'Invalid email format' };
  return { valid: true, normalized: clean.toLowerCase() };
}

// Validate required string
function validateRequired(str, fieldName, maxLen = 500) {
  const clean = sanitizeString(str);
  if (!clean) return { valid: false, error: `${fieldName} is required` };
  if (clean.length > maxLen) return { valid: false, error: `${fieldName} must be at most ${maxLen} characters` };
  return { valid: true, normalized: clean };
}

// Middleware factory for express-validator style validation
function validateBody(rules) {
  return async (req, res, next) => {
    const errors = [];
    for (const rule of rules) {
      const value = req.body[rule.field];
      let result;
      switch (rule.type) {
        case 'phone':
          result = validatePhone(value);
          break;
        case 'name':
          result = validateName(value, rule.fieldName || rule.field);
          break;
        case 'email':
          result = validateEmail(value);
          break;
        case 'required':
          result = validateRequired(value, rule.fieldName || rule.field, rule.maxLen);
          break;
        default:
          continue;
      }
      if (!result.valid) {
        errors.push({ field: rule.field, message: result.error });
      } else if (result.normalized !== undefined) {
        req.body[rule.field] = result.normalized;
      }
    }
    if (errors.length) return res.status(422).json({ errors });
    next();
  };
}

module.exports = {
  PHONE_REGEX,
  NAME_REGEX,
  EMAIL_REGEX,
  sanitizeString,
  validatePhone,
  validateName,
  validateEmail,
  validateRequired,
  validateBody,
};