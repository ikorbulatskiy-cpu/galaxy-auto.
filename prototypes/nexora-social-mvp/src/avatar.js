"use strict";

const SKINS = Object.freeze(["#f4c7a1", "#c9875b", "#75452f"]);
const SUITS = Object.freeze(["#6d7cff", "#ef6c9b", "#35bca5"]);
const HAIR = Object.freeze(["short", "long", "spiky", "bob", "ponytail", "curly"]);
const GENDERS = Object.freeze(["male", "female"]);
const OUTFITS = Object.freeze(["casual", "hoodie", "jacket", "dress", "beach", "club"]);
const HAIR_COLORS = Object.freeze(["#30233d", "#6b432c", "#e5c07b", "#e9eef8", "#bd5de5"]);
const SHOES = Object.freeze(["sneakers", "boots", "heels", "sandals"]);
const ACCESSORIES = Object.freeze(["none", "glasses", "headphones", "crown", "flower", "cap", "scarf"]);

function normalizeAvatar(input) {
  return {
    gender: GENDERS.includes(input?.gender) ? input.gender : "male",
    skin: SKINS.includes(input?.skin) ? input.skin : SKINS[0],
    hair: HAIR.includes(input?.hair) ? input.hair : "short",
    suit: SUITS.includes(input?.suit) ? input.suit : SUITS[0],
    outfit: OUTFITS.includes(input?.outfit) ? input.outfit : "casual",
    hairColor: HAIR_COLORS.includes(input?.hairColor) ? input.hairColor : HAIR_COLORS[0],
    shoes: SHOES.includes(input?.shoes) ? input.shoes : "sneakers",
    accessory: ACCESSORIES.includes(input?.accessory) ? input.accessory : "none"
  };
}

module.exports = { normalizeAvatar };
