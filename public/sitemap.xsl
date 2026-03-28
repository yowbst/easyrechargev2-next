<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

  <xsl:output method="html" indent="yes" encoding="UTF-8" />

  <xsl:template match="/">
    <html lang="en">
      <head>
        <title>Sitemap &#8212; easyRecharge</title>
        <meta name="robots" content="noindex, nofollow" />
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #1a1a2e;
            background: #f8fafc;
            padding: 2rem;
          }
          .header {
            max-width: 1200px;
            margin: 0 auto 2rem;
          }
          .header h1 {
            font-size: 1.5rem;
            font-weight: 700;
            color: #0891b2;
          }
          .header p {
            color: #64748b;
            margin-top: 0.25rem;
            font-size: 0.875rem;
          }
          table {
            width: 100%;
            max-width: 1200px;
            margin: 0 auto;
            border-collapse: collapse;
            background: #fff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
          }
          th {
            background: #0891b2;
            color: #fff;
            font-weight: 600;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 0.75rem 1rem;
            text-align: left;
          }
          td {
            padding: 0.625rem 1rem;
            font-size: 0.8125rem;
            border-bottom: 1px solid #f1f5f9;
            vertical-align: top;
          }
          tr:hover td { background: #f0fdfa; }
          a { color: #0891b2; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .alt {
            font-size: 0.75rem;
            color: #64748b;
          }
          .alt span {
            display: inline-block;
            background: #f1f5f9;
            padding: 0.125rem 0.375rem;
            border-radius: 3px;
            margin: 0.125rem 0.25rem 0.125rem 0;
          }
          .count {
            font-size: 0.8125rem;
            color: #64748b;
            max-width: 1200px;
            margin: 1rem auto 0;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>XML Sitemap</h1>
          <p>This sitemap is generated for search engines. Browse the site at <a href="https://easyrecharge.ch">easyrecharge.ch</a></p>
        </div>

        <xsl:choose>
          <xsl:when test="sitemap:sitemapindex">
            <table>
              <tr>
                <th>Sitemap</th>
              </tr>
              <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
                <tr>
                  <td><a><xsl:attribute name="href"><xsl:value-of select="sitemap:loc" /></xsl:attribute><xsl:value-of select="sitemap:loc" /></a></td>
                </tr>
              </xsl:for-each>
            </table>
          </xsl:when>
          <xsl:otherwise>
            <table>
              <tr>
                <th style="width:55%">URL</th>
                <th>Alternates</th>
                <th>Last Modified</th>
                <th>Freq</th>
                <th>Priority</th>
              </tr>
              <xsl:for-each select="sitemap:urlset/sitemap:url">
                <tr>
                  <td>
                    <a><xsl:attribute name="href"><xsl:value-of select="sitemap:loc" /></xsl:attribute><xsl:value-of select="sitemap:loc" /></a>
                  </td>
                  <td class="alt">
                    <xsl:for-each select="xhtml:link[@rel='alternate']">
                      <span><xsl:value-of select="@hreflang" /></span>
                    </xsl:for-each>
                  </td>
                  <td><xsl:value-of select="substring(sitemap:lastmod, 1, 10)" /></td>
                  <td><xsl:value-of select="sitemap:changefreq" /></td>
                  <td><xsl:value-of select="sitemap:priority" /></td>
                </tr>
              </xsl:for-each>
            </table>
            <p class="count"><xsl:value-of select="count(sitemap:urlset/sitemap:url)" /> URLs</p>
          </xsl:otherwise>
        </xsl:choose>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
