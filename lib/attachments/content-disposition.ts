/** RFC 5987 filename encoding keeps Unicode out of raw HTTP header values. */
export function attachmentContentDisposition(fileName: string, download: boolean) {
  const encoded = encodeURIComponent(fileName.toWellFormed()).replace(/['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${download ? "attachment" : "inline"}; filename="attachment"; filename*=UTF-8''${encoded}`;
}
