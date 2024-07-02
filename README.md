# getBoxQuadsPolyfill
a polyfill for the getBoxQuads API

# info
gets the 4 transformed corner points of an Elment in DOM. Works only for HTMLElments. For SVG and MathML it does not work correctly cause of missing "elments..."-Properties on SVGElement and MathMLElement

(see issue: https://github.com/w3c/csswg-drafts/issues/10514)

FF impl:
https://bugzilla.mozilla.org/show_bug.cgi?id=918189

more info about api:
https://lists.w3.org/Archives/Public/www-style/2013Aug/0609.html