# Luxury Realty — аудит интерфейса и взаимодействий

Дата: 3 ноября 2026 года. Ветка: `feat/interaction-system-20261103`.

**Статус: работа проходит проверку; финальная приёмка не подтверждена.** Кандидат исходников — `927684aeca30f858bcb43e998a003ab725ab8061`; runtime сохранён из `841fc4ae9927908761e927ce91fca007d455e58d`, новая версия меняет только QA harness. Базовая версия этого этапа — `1815633`. Результаты прежних прогонов ниже относятся к указанным снимкам, а не автоматически к текущему кандидату.

Preview-кандидат: [luxury-realty-imon-7nzt22a5a-cdo-2844s-projects.vercel.app](https://luxury-realty-imon-7nzt22a5a-cdo-2844s-projects.vercel.app). Развёртывание `dpl_GeGnKKcsEsngWCSew7CEwAGK3UC7` получило READY; публичная проверка этого URL и итоговый URL для приёмки — **pending**.

## Что изменено

**Общие компоненты.** Введены единые цвета поверхностей, текста, границ и ошибок, шаги расстояний, размеры controls, радиусы и состояния кнопок, ссылок, карточек и полей. Сохранены SF/Graphik, тёмный фон, золото и композиция главной. Формы получили явные подписи, границы, focus/error states и колонки, зависящие от доступной ширины. Верхняя панель заявки с контекстом и Close остаётся доступной при прокрутке. Правила собраны в [DESIGN-SYSTEM.md](../DESIGN-SYSTEM.md).

**Фильтры.** На главной Advanced search открывает полноценный нативный dialog, переносит запрос и тип сделки и показывает количество совпадений. В каталоге — компактная строка поиска, локация, переключатель сделки, сортировка, применённые параметры и общая панель подробного поиска. Черновик отделён от применённого состояния: Apply подтверждает, закрытие отменяет, Reset в панели меняет только черновик. Подтверждённые параметры сериализуются в URL; сохранены пагинация, история и возврат из карточки. Диапазон цены проверяется, нулевой результат объясняется. Header/footer фильтров отделены от прокручиваемых полей.

**Переходы и модалки.** Основа остаётся обычной навигацией между документами. Поддерживающие браузеры используют нативные View Transitions; ссылки не задерживаются таймером и не заменены SPA-роутером. Общий lifecycle dialog управляет открытием, закрытием, Escape, backdrop, возвратом фокуса, отменой устаревшей анимации и scroll lock. При уходе со страницы открытые слои закрываются; состояние кнопки меню синхронизируется с фактическим `dialog.open`, включая Back/Forward.

**Микроанимации.** Единая шкала 160/240/420 ms: короткие реакции controls, стрелок и карточек, последовательное появление меню, небольшие появления секций и плавная высота disclosures. Контент не скрыт базовыми стилями в ожидании JavaScript. Предпочтение reduced motion отключает движение; прокрутка страницы не перехватывается.

## Найденные проблемы и исправления

| Наблюдение | Исправление | Подтверждение / граница |
| --- | --- | --- |
| В Chromium один Escape в заполненном `input[type=search]` очищал запрос, но оставлял фильтры открытыми. Все 8 catalogue-вариантов r2 остановились на этом шаге; PNG показывали пустой запрос и восстановленный count. | В `841fc4a` добавлен узкий capture-handler только для Escape из search input: общий close/discard, с проверками composition и defaultPrevented. Native Escape у select не перехватывается. | Targeted Chromium на `927684a`: 2/2 catalogue views и 10/10 checks прошли. Полная focused матрица — pending. |
| В reduced motion корневой dialog создавал остаточный `scrollbar-color` transition 0,01 ms с одинаковыми keyframes. | Для dialog явно отключены transitions в reduced-motion media query. | Identity подтверждена [диагностикой](../../artifacts/interaction-system-20261103/dialog-diagnostic-r1/report.json); в r2 сценарии главной прошли motion-проверки. |
| В оригинальных PNG формы placeholder телефона обрезался на 320 px и в половинном desktop-поле. | Подсказка сокращена до «Country code + number». | Исправлено в исходниках; свежий визуальный receipt текущего кандидата — pending. |
| Повторное открытие панели могло сохранять старую прокрутку её body при уже восстановленном черновике. | Внутренняя область прокрутки сбрасывается при `lr:dialog-open`. | Найдено при source-review; проверяется в итоговых сценариях. |

Дополнительно по source-review мобильные native select каталога подняты с 13/11 до 16 px. Legacy `.filter-form` не конфликтует с новой `.property-filter-form`; Close заявки явно сбрасывает прежнее абсолютное позиционирование.

Два сбоя самого измерения отделены от runtime. Shift+Tab из первого элемента нативного dialog может переводить фокус в browser chrome; диагностика подтвердила `document.hasFocus=false` и возвращение следующим Tab, без фокуса на фоне. Helper проверяет эту границу и обязательный возврат; ручной focus trap не добавлен ([W3C H102](https://www.w3.org/WAI/WCAG22/Techniques/html/H102)). Четыре r2 image-findings возникли на menu-state после navigation/Back из-за offscreen lazy backgrounds: полный page-after-scroll и asset failures были чистыми. В `841fc4a` state capture проверяет viewport/текущий modal; строгая загрузка после полного прохода страницы сохранена.

В r6 на `841fc4a` check, build и content-output прошли, но targeted прогон остановился на ошибочном ожидании HTTP response для перехода к fragment текущего документа. В `927684a` исправлена только эта проверка навигации; runtime не менялся. Новый targeted прогон использует тот же собранный bundle `b7fc5b938fd20f00fedf78bfeb02751ef3183ebde6524e76a9bd95e62d9c8ddc`. Наследование r6 build отмечено отдельно и не считается новой сборкой или общей приёмкой.

## Что уже проверено

| Проверка | Версия / evidence | Фактический результат |
| --- | --- | --- |
| Unit preflight | Рабочий снимок с HEAD `1815633`; точные хеши в [preflight/report.json](../../artifacts/interaction-system-20261103/preflight/report.json), [unit.log](../../artifacts/interaction-system-20261103/preflight/unit.log) | **35/35**, без падений и пропусков. Это не новый прогон `841fc4a`. |
| Check, build, content-output | [validation-r5/report.json](../../artifacts/interaction-system-20261103/validation-r5/report.json), source `5dc919d` | Все три этапа завершились с кодом 0. Preflight content-output проверил 130 canonical pages и 2374 built assets; оставалось одно предупреждение. |
| Существующие функциональные сценарии | r5, source `5dc919d`: [Chromium](../../artifacts/interaction-system-20261103/content-chromium-r5/chromium-report.json), [WebKit](../../artifacts/interaction-system-20261103/content-webkit-r5/webkit-report.json) | **32 группы: 16 + 16**. В том числе gallery failure/retry, mocked films и mocked enquiry failure/retry/UUID/pending protection. |
| Предыдущий focused Chromium | [focused-chromium-r2](../../artifacts/interaction-system-20261103/focused-chromium-r2/visual-audit-report.json), source `5dc919d` | 27/35 views завершены; 8 остановились на Escape поиска, плюс 4 image-findings описаны выше. **Прогон не принят**, весь r5 имеет `passed:false`. |
| Check, build, content-output runtime-кандидата | [validation-r6/report.json](../../artifacts/interaction-system-20261103/validation-r6/report.json), source `841fc4a` | Все три этапа — код 0; r6 целиком не принят из-за fragment HTTP assertion в QA. Для `927684a` используется тот же runtime/bundle. |
| Targeted catalogue Chromium | [targeted-chromium-r2](../../artifacts/interaction-system-20261103/targeted-chromium-r2/visual-audit-report.json), source `927684a` | **2/2 views, 10/10 checks, 0 findings**. Подтверждает узкий повтор сценариев каталога; не всю матрицу. |
| Ручной просмотр меню и disclosure | [navigation-targeted-chromium-r1 receipt](../../artifacts/interaction-system-20261103/review-receipts/navigation-targeted-chromium-r1.json), source/runtime `841fc4a` | Просмотрены **4 оригинальных PNG** home390: menu и service-expanded при reduce/normal. В этих кадрах blockers не найдено; source/bundle и PNG hashes привязаны в receipt. |
| Ручной просмотр формы | r1, source `1cc69a9`; оригинальные PNG 017/018/019 property на 320/390/1440, состояния enquiry, validation, validation-submit | Просмотрено 9 PNG. Ошибки читаемы; нижние submit/status и sticky Close доступны. Выявлен длинный placeholder. Это частичный визуальный review прежнего source. |
| Focused Chromium + WebKit текущего кандидата | `927684a`, validation r7; runtime `841fc4a` | **Pending**: полная матрица ещё проверяется. |
| Публичный preview | `927684a`, URL выше | **Pending**. READY не заменяет browser/API/media smoke. |
| Все канонические страницы и финальный визуальный review | `927684a` | **Pending**. Покрытие и имена вручную просмотренных PNG должны быть приложены отдельно. |

## Ограничения и финальные evidence

В этой стадии реальные заявки не отправлялись; проверки retry/idempotency используют mock. Браузерный WebKit не равнозначен проверке на физическом iPhone. Ручной просмотр отдельных PNG не доказывает отсутствие дефектов на всех страницах и не подтверждает плавность движения сам по себе. Прежняя визуальная приёмка версии `1815633` не переносится на новый интерфейс.

Перед изменением статуса отчёта заполнить:

- **Validation r7 / source и bundle hashes:** pending — добавить ссылку на завершённый receipt.
- **Focused Chromium/WebKit:** pending — итог checks/findings, обычное и reduced motion, keyboard, Escape, Back/Forward.
- **All-pages:** pending — canonical count, captured/complete count, нерешённые findings.
- **Manual visual receipt:** pending — точные PNG, просмотренные состояния и исправленные замечания.
- **Public preview receipt и итоговый URL:** pending — связь deployment/source, результаты проверки опубликованной версии.
- **Итоговая приёмка:** pending; не заменять этот статус одним успешным build.
