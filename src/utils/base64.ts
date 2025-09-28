export function uint8ArrayToBase64(bytes: Uint8Array): string {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
    }
    let binary = '';
    const chunkSize = 0x8000; // 32k chunks to avoid call stack limits
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    if (typeof btoa === 'function') {
        return btoa(binary);
    }
    // Fallback: manual base64 encoding if btoa is unavailable
    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let result = '';
    let i = 0;
    while (i < binary.length) {
        const chr1 = binary.charCodeAt(i++);
        const chr2 = binary.charCodeAt(i++);
        const chr3 = binary.charCodeAt(i++);
        const enc1 = chr1 >> 2;
        const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        const enc3 = isNaN(chr2) ? 64 : ((chr2 & 15) << 2) | (chr3 >> 6);
        const enc4 = isNaN(chr3) ? 64 : chr3 & 63;
        result +=
            base64Chars.charAt(enc1) +
            base64Chars.charAt(enc2) +
            base64Chars.charAt(enc3) +
            base64Chars.charAt(enc4);
    }
    return result;
}

export function base64ToUint8Array(base64: string): Uint8Array {
    if (typeof Buffer !== 'undefined') {
        return Uint8Array.from(Buffer.from(base64, 'base64'));
    }
    if (typeof atob === 'function') {
        const binary = atob(base64);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            out[i] = binary.charCodeAt(i);
        }
        return out;
    }
    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = base64.replace(/[^A-Za-z0-9\+\/\=]/g, '');
    let i = 0;
    const bytes: number[] = [];
    while (i < str.length) {
        const enc1 = base64Chars.indexOf(str.charAt(i++));
        const enc2 = base64Chars.indexOf(str.charAt(i++));
        const enc3 = base64Chars.indexOf(str.charAt(i++));
        const enc4 = base64Chars.indexOf(str.charAt(i++));
        const chr1 = (enc1 << 2) | (enc2 >> 4);
        const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
        const chr3 = ((enc3 & 3) << 6) | enc4;
        bytes.push(chr1);
        if (enc3 !== 64) bytes.push(chr2);
        if (enc4 !== 64) bytes.push(chr3);
    }
    return new Uint8Array(bytes);
}
