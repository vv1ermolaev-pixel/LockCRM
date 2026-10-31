// Fills an empty database with realistic test contacts.
// Never deletes anything: if contacts already exist, it stops.
// Usage: pnpm db:seed [count]   (default: 1000)

import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { contacts, notes } from "../src/db/schema";
import { contactFrequencies } from "../src/lib/contact-frequency";

const CONTACT_COUNT = Number(process.argv[2] ?? 1000);
const BATCH_SIZE = 200;

// Deterministic random numbers, so every run produces the same data
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(20261006);
// Frequencies have their own generator: drawing from `random` would shift every value generated after it,
// and the contacts, notes and dates of an existing seed would come out different
const frequencyRandom = createRandom(20261027);
const chance = (probability: number) => random() < probability;
const randomInt = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];

type Gender = "m" | "f";
// A value that differs by grammatical gender: [masculine, feminine]
type Gendered = string | readonly [string, string];
const byGender = (value: Gendered, gender: Gender) =>
  typeof value === "string" ? value : value[gender === "m" ? 0 : 1];

// prettier-ignore
const maleNames = [
  "Александр", "Алексей", "Андрей", "Антон", "Артём", "Борис", "Вадим", "Валерий", "Василий", "Виктор",
  "Виталий", "Владимир", "Владислав", "Вячеслав", "Георгий", "Глеб", "Григорий", "Даниил", "Денис", "Дмитрий",
  "Евгений", "Егор", "Иван", "Игорь", "Илья", "Кирилл", "Константин", "Леонид", "Максим", "Матвей",
  "Михаил", "Никита", "Николай", "Олег", "Павел", "Пётр", "Роман", "Руслан", "Сергей", "Степан",
  "Тимофей", "Фёдор", "Юрий", "Ярослав",
];

// prettier-ignore
const femaleNames = [
  "Алёна", "Алина", "Алла", "Анастасия", "Анна", "Валентина", "Валерия", "Вера", "Вероника", "Виктория",
  "Галина", "Дарья", "Диана", "Евгения", "Екатерина", "Елена", "Елизавета", "Жанна", "Инна", "Ирина",
  "Кира", "Ксения", "Лариса", "Любовь", "Людмила", "Маргарита", "Марина", "Мария", "Надежда", "Наталья",
  "Нина", "Оксана", "Ольга", "Полина", "Светлана", "София", "Таисия", "Татьяна", "Ульяна", "Юлия", "Яна",
];

// prettier-ignore
const surnames = [
  "Иванов", "Смирнов", "Кузнецов", "Попов", "Васильев", "Петров", "Соколов", "Михайлов", "Новиков", "Фёдоров",
  "Морозов", "Волков", "Алексеев", "Лебедев", "Семёнов", "Егоров", "Павлов", "Козлов", "Степанов", "Николаев",
  "Орлов", "Андреев", "Макаров", "Никитин", "Захаров", "Зайцев", "Соловьёв", "Борисов", "Яковлев", "Григорьев",
  "Романов", "Воробьёв", "Сергеев", "Кузьмин", "Фролов", "Александров", "Дмитриев", "Королёв", "Гусев", "Киселёв",
  "Ильин", "Максимов", "Поляков", "Сорокин", "Виноградов", "Ковалёв", "Белов", "Медведев", "Антонов", "Тарасов",
  "Жуков", "Баранов", "Филиппов", "Комаров", "Давыдов", "Беляев", "Герасимов", "Богданов", "Осипов", "Сидоров",
  "Матвеев", "Титов", "Марков", "Миронов", "Крылов", "Куликов", "Карпов", "Власов", "Мельников", "Денисов",
  "Гаврилов", "Тихонов", "Казаков", "Афанасьев", "Данилов", "Савельев", "Тимофеев", "Фомин", "Чернов", "Абрамов",
  "Мартынов", "Ефимов", "Федотов", "Щербаков", "Назаров", "Калинин", "Исаев", "Чернышёв", "Быков", "Маслов",
  "Родионов", "Коновалов", "Лазарев", "Воронин", "Климов", "Филатов", "Пономарёв", "Голубев", "Кудрявцев", "Прохоров",
  "Наумов", "Потапов", "Журавлёв", "Овчинников", "Трофимов", "Леонов", "Соболев", "Ермаков", "Колесников", "Гончаров",
  "Емельянов", "Никифоров", "Грачёв", "Котов", "Гришин", "Ефремов", "Архипов", "Громов", "Кириллов", "Малышев",
  "Панов", "Моисеев", "Румянцев", "Акимов", "Кондратьев", "Бирюков", "Горбунов", "Анисимов", "Тихомиров", "Галкин",
  "Лукьянов", "Скворцов", "Юдин", "Белоусов", "Нестеров", "Симонов", "Харитонов", "Князев", "Цветков", "Левин",
  "Воронов", "Аксёнов", "Мальцев", "Логинов", "Горшков", "Савин", "Краснов", "Майоров", "Демидов", "Елисеев",
  "Рыбаков", "Сафонов", "Плотников", "Дёмин", "Хохлов", "Фадеев", "Молчанов", "Литвинов", "Ершов", "Ушаков",
  "Рябов", "Мухин", "Калашников", "Лобанов", "Корнилов", "Евдокимов", "Бородин", "Платонов", "Некрасов", "Бобров",
  "Жданов", "Блинов", "Коротков", "Муравьёв", "Крюков", "Дроздов", "Лавров", "Зуев", "Ларин", "Серов",
  "Островский", "Вишневский", "Покровский", "Савицкий", "Черных", "Шевченко", "Бондаренко", "Ким", "Цой", "Толстой",
];

function surnameFor(surname: string, gender: Gender) {
  if (gender === "m") return surname;
  if (/(ов|ев|ёв|ин|ын)$/.test(surname)) return `${surname}а`;
  if (/(ский|цкий)$/.test(surname)) return surname.replace(/ий$/, "ая");
  if (/ой$/.test(surname)) return surname.replace(/ой$/, "ая");
  return surname;
}

const aboutOptions: readonly Gendered[] = [
  ["Бывший коллега, бэкенд-разработчик", "Бывшая коллега, бэкенд-разработчица"],
  "Дизайнер интерфейсов",
  ["Сосед по даче", "Соседка по даче"],
  ["Однокурсник", "Однокурсница"],
  "Тренер по теннису",
  ["Юрист, помогал с договором аренды", "Юрист, помогала с договором аренды"],
  "Стоматолог",
  "Риелтор",
  ["Друг детства", "Подруга детства"],
  "Фотограф",
  "Мастер по ремонту квартир",
  "Бухгалтер, ведёт ИП",
  "Продакт-менеджер в финтехе",
  "Врач-терапевт",
  "Преподаватель английского",
  "Автомеханик",
  "Из бегового клуба",
  "Организатор IT-митапов",
  "Основатель стартапа",
  "HR в IT-компании",
  "Архитектор",
  "Психолог",
  "Нотариус",
  "Финансовый консультант",
  ["Владелец кофейни у дома", "Владелица кофейни у дома"],
  "Журналист",
  "Маркетолог",
  "Кондитер, печёт торты на заказ",
  "Ветеринар",
  "Инструктор по йоге",
  "Электрик",
  "Турагент",
  "Переводчик",
  "Аналитик данных",
  "Видеомонтажёр",
  "Музыкант",
  "Учитель в школе",
  "Родитель одноклассника дочери",
  ["Сосед по подъезду", "Соседка по подъезду"],
  ["Бывший руководитель", "Бывшая руководительница"],
  "Бизнес-ангел",
  ["Стажёр в нашей команде", "Стажёрка в нашей команде"],
  "Шеф-повар",
  "Флорист",
  "Фитнес-тренер",
  "Дизайнер интерьеров",
  "SMM-специалист",
  "Тестировщик",
  "Тимлид мобильной разработки",
  "Рекрутер",
  "Иллюстратор",
  "Сооснователь агентства",
  "Event-менеджер",
  "Инженер-строитель",
  "Агент по страхованию",
  "Педиатр",
  "Массажист",
  "Директор по продажам",
  "Копирайтер",
  "Преподаватель в университете",
];

const howWeMetOptions: readonly Gendered[] = [
  "Работали вместе в «Яндексе» в 2019–2021",
  "Учились в одной группе на мехмате МГУ",
  "Познакомились на конференции HighLoad++ в 2023",
  "Соседи по даче в Подмосковье",
  "Через общих друзей на дне рождения у Маши",
  "Бегаем в одном клубе по выходным",
  "Познакомились в отпуске в Сочи",
  "Вместе ходили на курсы английского",
  "Порекомендовали знакомые как хорошего специалиста",
  "Встретились на митапе по Python",
  "Сидели рядом в коворкинге на Тульской",
  "Дети ходят в один садик",
  "Играем в футбол по субботам",
  "Нашлись через объявление на Авито",
  "Знакомы со школы, учились в параллельных классах",
  ["Друг брата", "Подруга брата"],
  "Коллега сестры",
  ["Пришёл на мой воркшоп по продуктовой аналитике", "Пришла на мой воркшоп по продуктовой аналитике"],
  "Познакомились в самолёте до Новосибирска",
  "Работали над общим проектом для банка",
  "Вместе волонтёрили на марафоне",
  "Познакомились в чате жильцов дома",
  ["Был клиентом нашей студии", "Была клиенткой нашей студии"],
  "Ходили в одну секцию скалолазания",
  "Познакомились на свадьбе у Димы и Оли",
  "Через LinkedIn, переписывались про вакансию",
  "Жили в одной общаге в Питере",
  "Вместе проходили стажировку в 2018",
  "Встретились в очереди на концерт и разговорились",
  ["Читаю его канал, потом пересеклись офлайн", "Читаю её канал, потом пересеклись офлайн"],
];

// prettier-ignore
const topics = [
  "переезд в Казань", "новую работу", "идею совместного проекта", "ремонт квартиры",
  "поступление дочери в университет", "поездку в Грузию", "аренду офиса", "запуск своего продукта",
  "курс по UX-исследованиям", "покупку машины", "свадьбу в августе", "смену профессии",
  "книгу, которую пишет", "поход на Алтай", "инвестиции в недвижимость", "новый проект на работе",
  "открытие второй кофейни", "переход на удалёнку", "рождение сына", "марафон в Казани",
];

const specialists = [
  "хорошего юриста",
  "проверенного стоматолога",
  "риелтора",
  "бухгалтера",
  "дизайнера",
  "репетитора по математике",
  "автомеханика",
];
const months = [
  "январе",
  "феврале",
  "марте",
  "апреле",
  "мае",
  "июне",
  "июле",
  "августе",
  "сентябре",
  "октябре",
  "ноябре",
  "декабре",
];
const places = ["«Кофемании»", "«Шоколадницы»", "кофейни на Патриках", "коворкинга", "офиса", "парка Горького"];

type NoteContext = { gender: Gender };
// Past-tense verb agreement: "обещал" → "обещала", "собирался" → "собиралась"
const past = (verb: string, gender: Gender) =>
  gender === "m" ? verb : verb.endsWith("ся") ? `${verb.slice(0, -2)}ась` : `${verb}а`;
const dative = (gender: Gender) => (gender === "m" ? "ему" : "ей");
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const noteTemplates: Array<(context: NoteContext) => string> = [
  () => `Созвонились, обсудили ${pick(topics)}. Договорились созвониться снова в ${pick(months)}.`,
  ({ gender }) =>
    `Встретились у ${pick(places)}. ${capitalize(past("обещал", gender))} прислать контакты ${pick(specialists)}.`,
  ({ gender }) =>
    `${capitalize(past("рассказал", gender))} про ${pick(topics)}. Надо скинуть ${dative(gender)} ссылку на статью, которую обсуждали.`,
  () =>
    `День рождения — ${randomInt(1, 28)} ${pick(["марта", "мая", "июля", "сентября", "ноября", "января"])}. Не забыть поздравить.`,
  ({ gender }) => `${capitalize(past("попросил", gender))} помочь с резюме. Договорились: отправлю правки до пятницы.`,
  ({ gender }) =>
    `Переписывались в телеграме. ${capitalize(past("собирался", gender))} в Москву в ${pick(months)} — предложить встретиться.`,
  () => `Обсудили ${pick(topics)}. Интересная мысль — вернуться к ней через пару месяцев.`,
  ({ gender }) =>
    `${capitalize(past("порекомендовал", gender))} книгу «${pick(["Думай медленно… решай быстро", "Атомные привычки", "Спроси маму", "Чистый код", "Вдохновлённые"])}». Купить и прочитать.`,
  () => `Договорились о совместном ужине с семьями в ${pick(months)}. Выбрать место.`,
  ({ gender }) =>
    `Был длинный разговор про ${pick(topics)}. ${capitalize(past("выглядел", gender))} ${gender === "m" ? "уставшим" : "уставшей"}, стоит позвонить через неделю.`,
  ({ gender }) => `${capitalize(past("вернул", gender))} долг, всё ровно. Отношения отличные.`,
  ({ gender }) =>
    `${capitalize(past("познакомил", gender))} меня с коллегой по ${pick(["маркетингу", "разработке", "продажам", "дизайну"])}. Написать благодарность.`,
  ({ gender }) =>
    `${capitalize(past("попросил", gender))} контакт ${pick(specialists)}. Скинуть и через месяц узнать, пригодилось ли.`,
  () => `Коротко пересеклись на мероприятии. Обменялись новостями, договорились не пропадать.`,
];

const emailDomains = ["gmail.com", "yandex.ru", "mail.ru", "outlook.com", "icloud.com", "bk.ru", "proton.me"];

const translitMap: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};
const translit = (text: string) => [...text.toLowerCase()].map((char) => translitMap[char] ?? char).join("");

function makeEmail(firstName: string, surname: string) {
  const first = translit(firstName);
  const last = translit(surname);
  const local = pick([
    `${first}.${last}`,
    `${first[0]}.${last}`,
    `${last}.${first}`,
    `${first}${randomInt(70, 99)}`,
    `${last}${randomInt(1, 999)}`,
    `${first}_${last}`,
  ]);
  return `${local}@${pick(emailDomains)}`;
}

function makePhone() {
  const digits = () => String(randomInt(0, 9));
  const block = (length: number) => Array.from({ length }, digits).join("");
  return `+7 9${block(2)} ${block(3)}-${block(2)}-${block(2)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();
const randomDateBetween = (from: number, to: number) => new Date(from + random() * (to - from));

type SeedContact = {
  contact: typeof contacts.$inferInsert;
  notes: Array<{ body: string; createdAt: Date }>;
};

// About a third of the contacts get a frequency, so "Пора связаться" has something to show.
// Two draws every time, whatever the result, so each contact's value does not depend on the previous ones.
// "contact_marked_at" stays empty: nobody has pressed "Связались" yet
function makeFrequency() {
  const hasFrequency = frequencyRandom() < 1 / 3;
  const kind = frequencyRandom();
  return hasFrequency ? contactFrequencies[Math.floor(kind * contactFrequencies.length)] : null;
}

function makeContact(): SeedContact {
  const gender: Gender = chance(0.5) ? "m" : "f";
  const firstName = pick(gender === "m" ? maleNames : femaleNames);
  const baseSurname = pick(surnames);
  const surname = surnameFor(baseSurname, gender);
  const createdAt = randomDateBetween(now - 3 * 365 * DAY_MS, now - 2 * DAY_MS);

  const noteCount = chance(0.35) ? 0 : randomInt(1, 4);
  const contactNotes = Array.from({ length: noteCount }, () => ({
    body: pick(noteTemplates)({ gender }),
    createdAt: randomDateBetween(createdAt.getTime(), now - DAY_MS),
  })).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return {
    contact: {
      name: `${firstName} ${surname}`,
      about: chance(0.9) ? byGender(pick(aboutOptions), gender) : null,
      howWeMet: chance(0.85) ? byGender(pick(howWeMetOptions), gender) : null,
      phone: chance(0.9) ? makePhone() : null,
      email: chance(0.75) ? makeEmail(firstName, surname) : null,
      contactFrequency: makeFrequency(),
      createdAt,
      updatedAt: contactNotes.at(-1)?.createdAt ?? createdAt,
    },
    notes: contactNotes,
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill in the values.");
  }
  if (!Number.isInteger(CONTACT_COUNT) || CONTACT_COUNT <= 0) {
    throw new Error(`Contact count must be a positive integer, got: ${process.argv[2]}`);
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  try {
    const [{ value: existing }] = await db.select({ value: count() }).from(contacts);
    if (existing > 0) {
      console.log(`Database already has ${existing} contacts, seed skipped. Nothing was changed.`);
      return;
    }

    const generated = Array.from({ length: CONTACT_COUNT }, makeContact);
    let noteTotal = 0;

    await db.transaction(async (tx) => {
      for (let start = 0; start < generated.length; start += BATCH_SIZE) {
        const batch = generated.slice(start, start + BATCH_SIZE);
        const inserted = await tx
          .insert(contacts)
          .values(batch.map((item) => item.contact))
          .returning({ id: contacts.id, name: contacts.name });

        const batchNotes = inserted.flatMap((row, index) => {
          if (row.name !== batch[index].contact.name) {
            throw new Error("Inserted rows came back in an unexpected order");
          }
          return batch[index].notes.map((note) => ({ ...note, contactId: row.id }));
        });
        if (batchNotes.length > 0) {
          await tx.insert(notes).values(batchNotes);
        }
        noteTotal += batchNotes.length;
      }
    });

    console.log(`Seeded ${generated.length} contacts and ${noteTotal} notes.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
