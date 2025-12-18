"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAvailableNow = isAvailableNow;
function isAvailableNow(availability, now = Date.now()) {
    if (!availability.isAvailable)
        return false;
    if (!availability.tempUnavailableUntil)
        return true;
    const t = Date.parse(availability.tempUnavailableUntil);
    if (!Number.isFinite(t))
        return true;
    return now >= t;
}
//# sourceMappingURL=menu.js.map