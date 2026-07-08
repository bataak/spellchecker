# Монгол үгийн алдаа шалгагч

Интернет хөтчид зориулсан, офлайн горимд ажилладаг монгол болон англи хэлний
үгийн алдаа шалгагч — <https://aldaa.bichig.dev>

Шалгах ажиллагаа зөвхөн таны төхөөрөмж дээр хийгддэг тул мэдээлэл гуравдагч
серверт илгээгдэхгүй, суулгах болон бүртгүүлэх шаардлагагүй, ашиглахад үнэ
төлбөргүй, нээлттэй эх болно.

## Хөгжүүлэлт

Шаардлага: Node.js 22+.

```sh
npm ci             # шаардлагатай сангуудыг суулгах (эхний удаа)
npm test           # бичил шалгалт хийх
npm run dev        # хөгжүүлэлтийн сервер (localhost)
npm run preview    # production build хийж урьдчилан үзэх
npm run build      # production build (dist/)
```

`dev`, `preview`, `build` командууд эхлэхийн өмнө бичил шалгалт хийгдэнэ
(`predev`/`prepreview`/`prebuild` hook)

Service worker болон офлайн ажиллагааг шалгахдаа `npm run dev` биш
`npm run preview` ашиглана, учир нь dev сервер precache-ийг алгасдаг.

Толь бичгийн файлууд (`public/dict/`) build хийх үед `pack-dict.sh` файл
нь толинуудыг gzip болгон шахаж `dist/dict/` хавтсанд хуулна.

Commit төрөл нь release-please-ийн хувилбарыг тодорхойлно: `feat:` minor,
`fix:` patch, `style:`/`docs:`/`test:`/`chore:` хувилбар ахиулахгүй.
Push бүрд release PR автоматаар шинэчлэгдэнэ; хуримтлуулж байгаад PR-ыг
squash merge хийхэд release гарна.
