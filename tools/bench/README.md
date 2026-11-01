# Батарей, процессор, санах ойн хэмжилт

aldaa.bichig.dev апыг LibreOffice Writer, Microsoft Word-той харьцуулж, бичих үеийн
батарейн зарцуулалт, процессорын ачаалал, санах ойг хэмжинэ. Үр дүн
`help/zaavar/index.md` файлын «Санах ой ба батарейн зарцуулалт» хэсэгт ордог.

## Арга

- Программ бүрд `help/zaavar/*.md`-ээс авсан ижил монгол бичвэрийг 0.2 секунд тутамд
  нэг тэмдэгтээр (минутад 300 тэмдэгт) бичүүлнэ. Гар, хулганын фокусыг булаахгүй.
- Үе бүрийн эхний 45 секундийг (программ асах хугацаа) тооцохгүй.
- Үеүдийг ээлжлэн, давтан явуулна: эхэнд ба төгсгөлд `idle`, дунд нь программууд.
- Хэмжилтийн үеэр өөр ажил хийхгүй, бусад программ (ялангуяа хөтөч) хаалттай
  байна. Батарейтай компьютер цэнэглэгчгүй, дэлгэцийн гэрэлтүүлэг тогтмол, автомат
  гэрэлтүүлэг болон Low Power Mode (Windows дээр Battery saver) унтраалттай байна.
- Батарейгүй компьютер (Mac mini гэх мэт) дээр батарейн оронд `powermetrics`-ийн
  процессор, график процессорын чадлыг хэмжинэ. Энэ нь дэлгэцийн зарцуулалтыг
  оруулдаггүй тул программуудын зөрүүг илүү цэвэр харуулна.

Гаргах утгууд (`out/results-*.jsonl`):

| Талбар | Утга |
|---|---|
| `system_w` | Батарейгаас авч буй бүх системийн дундаж чадал, W |
| `cpu_w`, `gpu_w` | macOS дээр `powermetrics`-ийн процессор, график процессорын чадал, W |
| `combined_w` | Apple Silicon дээр процессор, график процессор, Neural Engine-ийн нийт чадал, W |
| `cpu_share` | Хэмжиж буй программын процессуудын CPU хугацаа / бодит хугацаа (1 = нэг цөм бүтэн) |
| `power_samples` | `cpu_w`, `gpu_w`-д орсон `powermetrics`-ийн дээжийн тоо |
| `memory_mb` | Программын процессуудын санах ойн дээд утга, MB. Linux, Windows дээр USS, macOS дээр `phys_footprint` тул хооронд нь шууд харьцуулахгүй |

## Үеүд

`idle`, `chromium`, `firefox`, `chromium-blank`, `firefox-blank`, `writer`, `word`.

`*-blank` нь апын оронд хоосон `<textarea>` бүхий хуудас бөгөөд хөтчийн өөрийн
зардлыг апын зардлаас салгахад хэрэглэнэ. `word` macOS, Windows дээр ажиллана.

## macOS дээр бэлтгэх

```
brew install node python
brew install --cask libreoffice
npm ci
npx playwright install chromium firefox
python3 -m pip install --user psutil
```

Microsoft Word суусан бол `word` үеийг ашиглана. Анх ажиллуулахад macOS
Terminal-д Word-ийг удирдах зөвшөөрөл (Automation) асууна.

`powermetrics` sudo шаарддаг. Хэмжилтээс өмнө хэрэглэгч `! sudo -v` гэж нууц үгээ
оруулна. Батарейтай компьютер дээр sudo эрхгүй бол `cpu_w`, `gpu_w` хоосон гарч,
бусад утга хэмжигдэнэ. Батарейгүй компьютер дээр sudo эрхгүй бол скрипт зогсоно.

## Windows дээр бэлтгэх

Windows 11 дээр ажиллуулж шалгасан (үр дүнг доороос харна уу). Microsoft Word
суусан, идэвхжсэн байх ёстой. LibreOffice нь анхдагч `C:\Program Files\LibreOffice`
замд сууна. `winget` ажиллахгүй бол Node, Python-ыг албан ёсны сайтаас суулгана.
Суулгасны дараа терминалаа дахин нээнэ.

```
winget install OpenJS.NodeJS.LTS Python.Python.3.13 TheDocumentFoundation.LibreOffice
npm ci
npx playwright install chromium firefox
py -m venv tools\bench\out\venv
tools\bench\out\venv\Scripts\pip install psutil pywin32
```

Скриптийг ажиллаж байгааг цэнэглэгчтэй үед шалгах:

```
tools\bench\out\venv\Scripts\python tools\bench\run.py --plugged --seconds 60 idle chromium writer word
```

Дараа нь цэнэглэгчийг салгаж, батарейн утгыг богино ажиллуулалтаар шалгана:

```
tools\bench\out\venv\Scripts\python tools\bench\run.py --seconds 60 idle chromium
```

Жинхэнэ хэмжилт (мөр бүр 40 минут орчим, цэнэглэгчгүй):

```
tools\bench\out\venv\Scripts\python tools\bench\run.py idle chromium writer word chromium writer word idle
tools\bench\out\venv\Scripts\python tools\bench\run.py idle firefox writer firefox-blank firefox writer idle
```

Windows дээр `cpu_w`, `gpu_w` хоосон гарна. `system_w`-г WMI-ийн
`BatteryStatus.DischargeRate`-ээс уншдаг. Энэ утга удаан шинэчлэгддэг тул батарейн
жинхэнэ хэмжилт зөрүүг ялгаж чадах эсэх нь тодорхойгүй. CPU, санах ойг цэнэглэгчтэй
үед ч хэмжиж болно (10 минут орчим):

```
tools\bench\out\venv\Scripts\python tools\bench\run.py --plugged --seconds 120 chromium firefox writer word
```

## Ажиллуулах

Скриптийг ажиллаж байгааг цэнэглэгчтэй үед шалгах (батарейг хэмжихгүй):

```
python3 tools/bench/run.py --plugged --seconds 60 idle chromium writer
```

Жинхэнэ хэмжилт (25–35 минут; батарейтай бол цэнэглэгчгүй, Mac mini дээр шууд):

```
python3 tools/bench/run.py idle chromium writer word chromium writer word idle
python3 tools/bench/run.py idle firefox writer firefox-blank firefox writer idle
```

## Linux дээрх үр дүн (2026-11-01)

Intel i7-1185G7, Arch Linux, sway (Wayland), Chromium/Firefox нь Playwright-ийн
хувилбар, LibreOffice 26.8.

| | Батарей (бичих үед нэмэгдсэн) | CPU, 30 сек | sway CPU, 30 сек | GPU ачаалал | Санах ой, YouTube нээлттэй хөтчид нэмэгдэх |
|---|---|---|---|---|---|
| Ап, Chromium | +0.15 W | 3.2 сек | 0.2 сек | 1% | 165 MB |
| Ап, Firefox | +0.48 W | 2.5 сек | 1.0 сек | 2.4% | 80 MB |
| LibreOffice Writer | +0.1–0.2 W | 2.1–3.1 сек | 0.8 сек | 4.5% | 355 MB (бие даасан) |

Сул зогсолт 4.6 W орчим. Firefox-ийн нэмэлт зарцуулалт хоосон `<textarea>`-д ч
адил гарсан тул апаас бус, Firefox дэлгэцэд гаргах аргаас шалтгаална. Бичихгүй
үед Firefox заагчийн анивчилтыг зогсоож бараг зарцуулалтгүй болдог бол Chromium
тасралтгүй анивчуулдаг.

## Windows дээрх үр дүн (2026-11-01)

Intel i7-1185G7, 16 GB RAM, Lenovo 20W1S2YY00, Windows 11 Pro, Chromium 156 ба
Firefox 157 нь Playwright-ийн хувилбар, LibreOffice 26.2, Word 16.0. `--plugged
--seconds 120` горимоор хэмжсэн. Энэ горимд батарейг хэмжээгүй бөгөөд цэнэглэгчгүй
байсан ажиллуулалт ч бий. Тоог зөвхөн энэ компьютерийн программуудын хооронд
харьцуулна.

| | Ажиллуулалт | `cpu_share` | CPU, 30 сек | Санах ой |
|---|---|---|---|---|
| Ап, Chromium | 3 | 0.026, 0.063, 0.071 | 0.8–2.1 сек | 402–427 MB |
| Хоосон хуудас, Chromium | 3 | 0.065, 0.078, 0.069 | 2.0–2.3 сек | 257–261 MB |
| Ап, Firefox | 1 | 0.015 | 0.5 сек | 789 MB |
| Хоосон хуудас, Firefox | 1 | 0.046 | 1.4 сек | 515 MB |
| LibreOffice Writer | 1 | 0.041 | 1.2 сек | 373 MB |
| Word | 1 | 0.040 | 1.2 сек | 165 MB |

Эдгээрийг процессуудыг PID-аар ялгахаас өмнө хэмжсэн тул Writer-ийн 373 MB-д
`soffice.exe` давхар тоологдсон байж болзошгүй.

Санах ойн нэмэгдэл нь ижил хөтчийн апын ба хоосон хуудасны зөрүү: Chromium дээр 160
MB орчим (144–170 MB, 3 хос), Firefox дээр 274 MB (1 хос). Бичвэр `#editor`-т
бүрэн орж, алдаа шалгагч буруу үгийг илрүүлж байгааг хоёр хөтөч дээр шалгасан.

CPU-гийн тоог тусламжийн хуудсанд оруулахгүй:

- Chromium дээр ап, хоосон хуудасны утга давхцсан тул апын зардал ялгагдаагүй.
  Ээлжлэн хэмжихэд ап 0.063, 0.071, хоосон хуудас 0.078, 0.069 гарсан.
- Chromium апын утга ижил тохиргоотой ажиллуулалтуудад 0.026–0.071 хооронд
  хэлбэлзсэн. Шалтгаан нь тодорхойгүй тул программуудын дарааллыг дүгнэхгүй.
- Firefox, Writer, Word-ыг нэг л удаа хэмжсэн.

## Windows дээр шалгах зүйлс

1. `system_w`: 0 биш гарсан ч найдваргүй. 60 секундийн ажиллуулалтад `idle` 7.00 W,
   `chromium` 7.89 W, `writer` ба `word` хоёулаа яг 11.35 W гарсан нь хуучирсан утга
   бололтой. `DischargeRate` 12–33 секунд тутамд өөрчлөгдөж, сул үед 6.75–7.17 W
   хооронд хэлбэлзсэн тул 0.15 W орчим зөрүүг ялгах баталгаагүй. 240 секундийн
   жинхэнэ хэмжилтийг хийгээгүй. Зөрүүг ялгаж чадахгүй бол тоог тусламжийн хуудсанд
   оруулахгүй.
2. `BatteryStatus`-ийг администратор эрхгүйгээр уншиж чадаж байгаа эсэх: шалгаагүй,
   туршилтыг администратор эрхтэй сессээс хийсэн.
3. `word` үеийн анхны ажиллуулалтад Word-ын харилцах цонх гарч бичихэд саад болох
   эсэх: бичилт бүх ажиллуулалтад саадгүй явсан. Цонх дэлгэцэд гарсан эсэхийг нүдээр
   шалгаагүй.
4. Windows-ийн тоог зөвхөн тухайн компьютер доторх программуудын хооронд харьцуулах.
   Linux-ийн хүснэгттэй шууд нийлүүлэхгүй. Хуудасны бичвэрийг хэрэглэгч хянана.

## macOS дээр шалгах зүйлс

1. Ап (Safari биш Chromium, Firefox), Writer, Word гурвын CPU, GPU-ийн чадал, CPU
   хугацаа, санах ой.
2. Firefox-ийн дэлгэцэд гаргах зардал macOS дээр мөн өндөр гарах эсэх.
3. Үр дүнгээр тусламжийн хуудасны хүснэгтийг шинэчлэх. Хуудасны бичвэрийг
   хэрэглэгч хянана.

`powermetrics`-ийн plist талбаруудыг (`processor.cpu_power`, `processor.gpu_power`)
Apple Silicon дээр шалгаагүй тул эхний ажиллуулалтад утга зөв гарч байгааг нягтална.
