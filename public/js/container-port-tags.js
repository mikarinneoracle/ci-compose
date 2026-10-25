// Shared by the browser, REST create route, and Docker Compose conversion.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ContainerPortTags = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function key(name) {
        // OCI tag keys exclude spaces, periods and non-ASCII characters.
        // Escape '%' too, so "Super Jet" and "Super%20Jet" stay distinct.
        return encodeURIComponent(name).replace(/\./g, '%2E');
    }

    function name(tagKey) {
        try {
            return decodeURIComponent(tagKey);
        } catch (_) {
            return tagKey; // Existing tags may contain literal percent characters.
        }
    }

    function port(tags, containerName) {
        return tags?.[key(containerName)] ?? tags?.[containerName];
    }

    function normalize(tags, containers) {
        if (!tags || typeof tags !== 'object') return tags;
        const names = new Set(containers.map(container => container.displayName));
        const normalized = {};
        for (const [tagKey, value] of Object.entries(tags)) {
            // Repair legacy port tags from REST clients and saved deployments.
            const normalizedKey = names.has(tagKey) && /[^\x21-\x7E]|\./.test(tagKey)
                ? key(tagKey) : tagKey;
            if (Object.hasOwn(normalized, normalizedKey)) {
                throw new Error(`Conflicting container port tag: ${normalizedKey}`);
            }
            Object.defineProperty(normalized, normalizedKey, {
                value, enumerable: true, configurable: true, writable: true
            });
        }
        return normalized;
    }

    return { key, name, port, normalize };
}));
