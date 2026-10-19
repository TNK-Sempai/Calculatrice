# Regenere fonts/shippori-jp.woff2 avec tous les caracteres japonais du projet.
# Prerequis : pip install fonttools brotli, puis npm install @fontsource/shippori-mincho-b1
# Usage : python outils/sous-ensemble-jp.py chemin/vers/node_modules/@fontsource/shippori-mincho-b1
import re, glob, os, sys, tempfile
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.merge import Merger
base=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
txt=''
for f in glob.glob(base+'/js/**/*.js',recursive=True)+[base+'/index.html']:
    txt+=open(f,encoding='utf8').read()
chars=sorted({c for c in txt if 0x3000<=ord(c)<=0x30ff or 0x4e00<=ord(c)<=0x9fff or 0xff00<=ord(c)<=0xffef or 0x3400<=ord(c)<=0x4dbf})
print(len(chars), ''.join(chars))
d=sys.argv[1].rstrip('/')+'/'
css=open(d+'600.css').read()
blocs=re.findall(r'src:\s*url\(([^)]+?\.woff2)\)[^;]*;.*?unicode-range:\s*([^;]+);',css,re.S)
cps=set(ord(c) for c in chars)
tmp=tempfile.mkdtemp()
parts=[]
for i,(url,rng) in enumerate(blocs):
    r=set()
    for t in rng.split(','):
        t=t.strip().replace('U+','')
        if '-' in t:
            a,b=t.split('-'); r.update(range(int(a,16),int(b,16)+1))
        else: r.add(int(t,16))
    need=cps & r
    if not need: continue
    src=d+url.strip('"\'').replace('./','')
    f=TTFont(src)
    o=subset.Options(); o.layout_features=['*']; o.notdef_outline=True
    s=subset.Subsetter(o); s.populate(unicodes=need); s.subset(f)
    f.flavor=None; p=os.path.join(tmp,f'p{i}.ttf'); f.save(p); parts.append(p)
print(len(parts),'parties')
m=Merger().merge(parts)
m.flavor='woff2'; m.save(base+'/fonts/shippori-jp.woff2')
got=set(TTFont(base+'/fonts/shippori-jp.woff2').getBestCmap())
print('manquants:', ''.join(chr(c) for c in cps-got))
