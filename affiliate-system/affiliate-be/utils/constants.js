const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&^#()_+\-=\[\]{};':"\\|,.<>\/]{8,25}$/;

const ROLES = {
  AFFILIATE: "affiliate",
  OPERATOR: "operator",
};

module.exports = {
  PASSWORD_REGEX,
  ROLES,
};
