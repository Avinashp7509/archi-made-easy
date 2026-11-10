// Shops call the API with a token issued by the identity provider.
const { createRemoteJWKSet, jwtVerify } = require('jose');

const keys = createRemoteJWKSet(new URL(`${process.env.JWT_ISSUER}/.well-known/jwks.json`));

async function requireShopToken(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const { payload } = await jwtVerify(token, keys, { issuer: process.env.JWT_ISSUER });
    req.shop = { id: payload.shop_id };
    next();
  } catch {
    res.sendStatus(401);
  }
}

module.exports = { requireShopToken };
