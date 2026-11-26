import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pageIdOf, pagesOf, parseInline, parseMarkdown, siteHref, slug } from './markdown'

describe('parseInline', () => {
  it('reads an image inside a link (a badge) as a link around the image', () => {
    expect(parseInline('[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) and more')).toEqual([
      { t: 'link', href: 'LICENSE', children: [{ t: 'img', alt: 'License: MIT', src: 'https://img.shields.io/badge/license-MIT-blue.svg' }] },
      { t: 'text', text: ' and more' }
    ])
  })

  it('still reads plain links, images, code, bold and italics', () => {
    expect(parseInline('[a](b.md) ![c](d.png) `e` **f** *g*')).toEqual([
      { t: 'link', href: 'b.md', children: [{ t: 'text', text: 'a' }] },
      { t: 'text', text: ' ' },
      { t: 'img', alt: 'c', src: 'd.png' },
      { t: 'text', text: ' ' },
      { t: 'code', text: 'e' },
      { t: 'text', text: ' ' },
      { t: 'strong', children: [{ t: 'text', text: 'f' }] },
      { t: 'text', text: ' ' },
      { t: 'em', children: [{ t: 'text', text: 'g' }] }
    ])
  })

  it('leaves no Markdown syntax as text in the README (what /docs?page=overview shows)', () => {
    for (const line of readFileSync(new URL('../../README.md', import.meta.url), 'utf8').split('\n')) {
      if (/^\s*(```|<|#|\||    )/.test(line)) continue
      for (const n of parseInline(line)) if (n.t === 'text') expect(n.text, line).not.toMatch(/!?\[[^\]]*\]\(/)
    }
  })

  it('reads a bare address as a link, without the punctuation that follows it', () => {
    expect(parseInline('see https://github.com/a/b, and (https://x.dev/c).')).toEqual([
      { t: 'text', text: 'see ' },
      { t: 'link', href: 'https://github.com/a/b', children: [{ t: 'text', text: 'https://github.com/a/b' }] },
      { t: 'text', text: ', and (' },
      { t: 'link', href: 'https://x.dev/c', children: [{ t: 'text', text: 'https://x.dev/c' }] },
      { t: 'text', text: ').' }
    ])
    // an address in code or already in a link stays as it is
    expect(parseInline('`https://a.dev/x` [b](https://b.dev/y)')).toEqual([
      { t: 'code', text: 'https://a.dev/x' },
      { t: 'text', text: ' ' },
      { t: 'link', href: 'https://b.dev/y', children: [{ t: 'text', text: 'b' }] }
    ])
  })
})

describe('reference-style links (the changelog)', () => {
  it('turns [label] into a link when a [label]: url line defines it, and hides that line', () => {
    const src = ['## [1.0.0] - 2026-01-01', '', 'Text with [Unreleased] and `[1.0.0]` in code and [other].', '', '[unreleased]: https://u.dev', '[1.0.0]: https://v.dev'].join('\n')
    expect(parseMarkdown(src)).toEqual([
      { t: 'heading', level: 2, id: '100---2026-01-01', text: '[1.0.0](https://v.dev) - 2026-01-01' },
      { t: 'paragraph', text: 'Text with [Unreleased](https://u.dev) and `[1.0.0]` in code and [other].' }
    ])
  })

  it('keeps a heading anchor free of the link address', () => {
    expect(slug('[0.3.1](https://github.com/robinnat/mochiz/compare/v0.3.0...v0.3.1) - 2026-11-26')).toBe('031---2026-11-26')
  })

  it('lists a root page of docs/README.md and links to it on the site', () => {
    expect(pagesOf('- [Reference](reference.md): x\n- [Changelog](../CHANGELOG.md): y')).toEqual([
      { title: 'Reference', file: 'reference.md' },
      { title: 'Changelog', file: '../CHANGELOG.md' }
    ])
    expect(pageIdOf('../CHANGELOG.md')).toBe('changelog')
    expect(siteHref('CHANGELOG.md', '')).toBe('/docs?page=changelog')
    expect(siteHref('../CHANGELOG.md#030---2026-11-25', 'docs/')).toBe('/docs?page=changelog#030---2026-11-25')
    expect(siteHref('CONTRIBUTING.md', '')).toBe('https://github.com/robinnat/mochiz/blob/main/CONTRIBUTING.md')
  })
})
