export function siteTarget(value = process.env.ARCHI_MADE_EASY_SITE_TARGET) {
  if (value === undefined || value === '' || value === 'github') {
    return { name: 'github', site: 'https://tt-a1i.github.io', base: '/archi-made-easy', outDir: './dist' };
  }
  if (value === 'cloudflare') {
    return { name: 'cloudflare', site: 'https://archi-made-easy.example', base: '/', outDir: './dist-cloudflare' };
  }
  throw new Error(`Unknown ARCHI_MADE_EASY_SITE_TARGET: ${value}`);
}
