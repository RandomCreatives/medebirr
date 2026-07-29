/**
 * Client-side validation utilities (mirrors backend)
 */

// Ethiopian phone regex
const PHONE_REGEX = /^(\+251|0)(9|7)\d{8}$/;

// Name regex: letters (Unicode), spaces, hyphens, apostrophes
const NAME_REGEX = /^[\p{L}\s\-']+$/u;

// Email regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sanitize: trim and collapse whitespace
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/\s+/g, ' ');
}

// Validate Ethiopian phone
function validatePhone(phone) {
  const clean = sanitizeString(phone);
  if (!clean) return { valid: false, error: 'Phone number is required' };
  if (!PHONE_REGEX.test(clean)) {
    return { valid: false, error: 'Invalid Ethiopian phone. Use +2519XXXXXXXX, +2517XXXXXXXX, 09XXXXXXXX, or 07XXXXXXXX' };
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

// Validate name
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

// Real-time input sanitization for name fields (strip invalid chars as user types)
function sanitizeNameInput(inputEl) {
  inputEl.value = inputEl.value.replace(/[^\p{L}\s\-']/gu, '');
}

// Real-time input sanitization for phone fields
function sanitizePhoneInput(inputEl) {
  // Allow only digits, +, and spaces while typing
  inputEl.value = inputEl.value.replace(/[^\d\+]/g, '');
}

// Attach sanitization listeners
function attachNameSanitizer(selector) {
  document.querySelectorAll(selector).forEach(el => {
    el.addEventListener('input', () => sanitizeNameInput(el));
  });
}

function attachPhoneSanitizer(selector) {
  document.querySelectorAll(selector).forEach(el => {
    el.addEventListener('input', () => sanitizePhoneInput(el));
  });
}

window.Validation = {
  PHONE_REGEX,
  NAME_REGEX,
  EMAIL_REGEX,
  sanitizeString,
  validatePhone,
  validateName,
  validateEmail,
  validateRequired,
  sanitizeNameInput,
  sanitizePhoneInput,
  attachNameSanitizer,
  attachPhoneSanitizer,
};