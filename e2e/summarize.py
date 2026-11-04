import re,sys
s=open(sys.argv[1]).read()
for l in s.split('\n'):
    if re.match(r'\s+[✓✘]',l): print(l[:150])
parts=re.split(r'\n\s+\d+\) \[chromium\] › ',s)
for p in parts[1:]:
    lines=[l for l in p.split('\n') if l.strip()]
    print('=====',lines[0][:80])
    n=0
    for l in lines[1:]:
        if 'attachment' in l or '─────' in l: break
        if re.search(r'^\s+at \.\./lib|^\s+\d+ \|',l) and n>3: continue
        print(l[:230]); n+=1
        if n>int(sys.argv[2] if len(sys.argv)>2 else 14): break
print([l for l in s.split('\n') if 'passed' in l or 'failed' in l or l.startswith('EXIT')])
