const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs'); 

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

if (!fs.existsSync('uploads')) { fs.mkdirSync('uploads'); }
app.use('/uploads', express.static('uploads'));

const DB_PATH = 'uploads/database.json';

const defaultArenaQuestions = {
    family: [ { q: "מי במשפחה תמיד קם ראשון בשבת בבוקר?", a: "המשכים המשפחתי" }, { q: "מי הכי סביר שייצא מהבית ויחזור כי הוא שכח משהו?", a: "המפוזר/ת המקסים/ה" }, { q: "מהו המאכל שכולם מחכים לו בערב שבת?", a: "המנה המנצחת של הבית" }, { q: "מי במשפחה הכי מצחיק כשמישהו קצת עצוב?", a: "המעודד/ת הרשמי/ת" }, { q: "מי במשפחה זקוק להכי הרבה שעות שינה?", a: "הישנוני/ת של הבית" }, { q: "מהו המשפט שיוצא לאבא הכי הרבה פעמים מהפה?", a: "משפט המפתח של אבא" }, { q: "מי הכי בשלן במשפחה (חוץ מאמא)?", a: "השף/ית הסודי/ת" }, { q: "מי במשפחה תמיד מאחר ב-5 דקות לכל תפילה או אירוע?", a: "זה שחי לפי שעון משלו" }, { q: "מהו השיר או הניגון שתמיד מזכיר לכם את הבית?", a: "ההמנון המשפחתי" }, { q: "מי הכי טכנולוגי במשפחה ועוזר לכולם עם מכשירים?", a: "מוקד התמיכה האנושי" }, { q: "מה הצבע של המזוזה בכניסה לבית?", a: "תסתכלו בדלת" }, { q: "מי הכי סביר שייקח איתו מזוודה ענקית לנסיעה של יומיים?", a: "זה שמתכונן לכל תרחיש" }, { q: "כמה חלונות יש בבית?", a: "הגיע הזמן לבדוק" }, { q: "מי במשפחה תמיד יודע איפה נמצאים המפתחות של כולם?", a: "בעל/ת עיני הרנטגן" }, { q: "מי הכי סביר שייצא מהבית עם גרביים לא תואמות?", a: "המפוזר/ת" }, { q: "מי הכי סביר שיחזור מהמכולת עם דברים שלא היו ברשימה?", a: "חובב המבצעים" }, { q: "איזה סיפור או ספר קראתם/שמעתם הכי הרבה פעמים?", a: "הקלאסיקה המשפחתית" }, { q: "מי הכי סביר שיתחיל לשיר באמצע הליכה ברחוב?", a: "הזמר/ת של הבית" }, { q: "מהו המנהג המיוחד שקיים רק במשפחה שלכם?", a: "המסורת הסודית שלנו" }, { q: "מי הכי אחראי בבית על הסדר והניקיון?", a: "שוטר/ת הסדר" }, { q: "נכון או לא נכון: במגירת התבלינים יש תבלין שלא השתמשו בו שנה.", a: "מבחן הניקיון של פסח" }, { q: "נכון או לא נכון: יש לכם בבית חפץ ששייך לסבא או סבתא.", a: "מבחן המורשת" }, { q: "נכון או לא נכון: הידית של הברז במטבח פונה שמאלה כשסוגרים אותה.", a: "מבחן הדיוק" }, { q: "מה הדבר הראשון שעושים כשנכנסים הביתה?", a: "חליצת נעליים / נטילת ידיים" }, { q: "מי במשפחה הכי פוחד מג'וקים או מחרקים?", a: "זה שבורח ראשון מהחדר" }, { q: "איזו תכונה אחת מאפיינת את המשפחה שלכם יותר מהכל?", a: "שמחה / עזרה / הכנסת אורחים" }, { q: "מה הצבע של המגבת שתלויה כרגע במטבח?", a: "מבחן הזיכרון לטווח קצר" }, { q: "מי הכי אוהב לדבר בטלפון שעות ארוכות?", a: "הדובר/ת הרשמי/ת" }, { q: "מהו החפץ הכי יקר שיש בבית?", a: "זה נמצא בכספת" }, { q: "איך קוראים לבן דוד הכי צעיר במשפחה?", a: "אולי אפילו עוד לא קראו לו שם" }, { q: "מהי המילה שמשתמשים בה הכי הרבה בתוך הבית?", a: "מילת המפתח המשפחתית" }, { q: "מי הכי סביר שיתנדב ראשון לעזור לשכן שזקוק לעזרה?", a: "איש/אשת החסד" }, { q: "כמה חבילות טישו פותחים בבית לפני שבת?", a: "לשאול את אבא" }, { q: "מי במשפחה הכי אוהב להתחדש בבגדים?", a: "חובב/ת האופנה" }, { q: "מה הדבר שהכי מעצבן את אמא (בצחוק)?", a: "זהירות... לא לעשות את זה" }, { q: "מי הכי סביר שישכח איפה קשר את האופניים?", a: "הנווט/ת המבולבל/ת" }, { q: "מהי המתנה הכי יפה שמישהו קיבל מהמשפחה?", a: "משהו שנשאר למזכרת" }, { q: "מי במשפחה הכי פחות אוהב לקום בבוקר?", a: "טיפוס של לילה" }, { q: "מה הדבר שכולכם הכי אוהבים לעשות בצהרי יום שישי?", a: "מנוחה / טעימות" }, { q: "מי הכי סביר שיגמור את החטיפים בלילה?", a: "גנב/ת הממתקים" }, { q: "איזו תחפושת פורים היתה הכי מוצלחת אי פעם?", a: "התחפושת המנצחת" }, { q: "מי במשפחה תמיד מצלם את כולם באירועים?", a: "הצלם/ת המשפחתי/ת" }, { q: "כמה כיסאות בסך הכל יש בבית (כולל מתקפלים)?", a: "מי סופר אורחים?" }, { q: "מי במשפחה הכי אוהב טבע ובעלי חיים?", a: "חובב/ת הבריאה" }, { q: "מהו החפץ הכי עתיק בבית שעדיין בשימוש?", a: "הרהיט או הכלי של פעם" }, { q: "מי הכי סביר שינצח בתחרות אכילה?", a: "התיאבון הבריא של הבית" }, { q: "מה היה מעשה הקונדס הכי גדול שאחד הילדים עשה?", a: "סיפור הבלאגן הגדול" }, { q: "באיזה צבע המברשת שיניים של אמא?", a: "הגיע הזמן לבדוק" }, { q: "מהו הדבר שכולכם מסכימים עליו בלי ויכוח?", a: "הקונצנזוס המשפחתי" }, { q: "איזה חפץ אם ינסו לתקן אותו רק ישבר יותר?", a: "האגרטל/חפץ אחר" }, { q: "מהו המשקה שבלעדיו אי אפשר לסיים סעודה?", a: "קפה / תה / מיץ" }, { q: "מי נמצא הראשון בממד או במקלט?", a: "הזריז" }, { q: "מי במשפחה יש לו את הכתב הכי יפה?", a: "הסופר/ת שלנו" } ],
    nature: [ { q: "איזו חיה ישנה בעמידה?", a: "סוס או פיל" }, { q: "מהו העץ הלאומי של ישראל?", a: "זית" }, { q: "איזו ציפור היא הגדולה ביותר בעולם?", a: "יען" }, { q: "איזה יונק הוא היחיד שמסוגל לעוף?", a: "עטלף" }, { q: "מהו הדג המהיר ביותר באוקיינוס?", a: "מפרשן (Sailfish)" }, { q: "איזה בעל חיים מחליף את צבעו כדי להסתוות?", a: "זיקית (או תמנון)" }, { q: "מהו היונק הגדול ביותר בעולם?", a: "לווייתן כחול" }, { q: "איזו חיה ידועה כ'ספינת המדבר'?", a: "גמל" }, { q: "איפה נמצאות השיניים של החילזון?", a: "על הלשון שלו" }, { q: "כמה לבבות יש לתמנון?", a: "3" }, { q: "מהו סוג הדם של תמנון?", a: "כחול" }, { q: "איזו ציפור מסוגלת לעוף אחורנית?", a: "קוליברי (צופית)" }, { q: "איזה בעל חיים לא יכול לקפוץ?", a: "פיל" }, { q: "איזה נחש הוא הארוך ביותר בעולם?", a: "פיתון מרושת" }, { q: "מהו הגז הנפוץ ביותר באטמוספירה של כדור הארץ?", a: "חנקן" }, { q: "איך קוראים לקבוצת כוכבים שיוצרת צורה בשמיים?", a: "קונסטלציה (מזל)" }, { q: "איזה כוכב לכת הכי קרוב לשמש?", a: "חמה (מרקורי)" }, { q: "כמה ימים לוקח לכדור הארץ להקיף את השמש?", a: "365 ורבע (שנה)" }, { q: "מהו המדבר הגדול ביותר בעולם?", a: "אנטארקטיקה (או סהרה כמדבר חם)" }, { q: "איזו מדינה נחשבת לביתם של הכי הרבה קנגורו?", a: "אוסטרליה" }, { q: "מהו ההר הגבוה ביותר בעולם?", a: "האוורסט" }, { q: "איזה נהר הוא הארוך ביותר בעולם?", a: "הנילוס (או האמזונס)" }, { q: "איך קוראים לסלע מותך שנמצא בתוך הר געש?", a: "מאגמה" }, { q: "מהו החומר הקשה ביותר שנמצא בטבע?", a: "יהלום" }, { q: "איזה בעל חיים ישן עם עין אחת פקוחה?", a: "דולפין" }, { q: "מהי הציפור הלאומית של ישראל?", a: "דוכיפת" }, { q: "כמה זמן לוקח לאור השמש להגיע לכדור הארץ?", a: "כ-8 דקות" }, { q: "מה מיוחד בעץ 'הסקויה'?", a: "העץ הגבוה ביותר בעולם" }, { q: "איזה חוש הכי מפותח אצל כלבים?", a: "חוש הריח" }, { q: "מהי החיה המהירה ביותר על פני היבשה?", a: "ברדלס (צ'יטה)" }, { q: "איזו קבוצת בעלי חיים מטילה ביצים אבל מניקה חלב?", a: "יונקי ביב (כמו הברווזן)" }, { q: "כמה עצמות יש בגוף של כריש?", a: "0 (השלד עשוי מסחוס)" }, { q: "איך דבורים מתקשרות זו עם זו?", a: "באמצעות 'ריקוד'" }, { q: "איזה יונק ימי ידוע בשירה שלו?", a: "לווייתן גדול-סנפיר" }, { q: "מה שמו של המקום הכי עמוק באוקיינוס?", a: "שקע מריאנה" }, { q: "מהו בעל החיים שחי הכי הרבה שנים?", a: "מדוזה מסוג מסוים (אלמותית) או כריש גרינלנד" }, { q: "איך קוראים לתהליך שבו זחל הופך לפרפר?", a: "גלגול מלא" }, { q: "איזה חלק בפרח מושך אליו דבורים?", a: "עלי הכותרת" }, { q: "באיזה צד של העץ גדל בדרך כלל טחב?", a: "צפון" }, { q: "מהו פרי הדר?", a: "תפוז, לימון, אשכולית וכו'" }, { q: "מאיזה עץ מפיקים שעם?", a: "אלון השעם" }, { q: "מהו שמו הנוסף של הירח של כדור הארץ?", a: "הלבנה" }, { q: "איזו מתכת נוזלית בטמפרטורת החדר?", a: "כספית" }, { q: "מהו המשאב היקר ביותר המופק מהים?", a: "נפט / גז" }, { q: "איזו חיה ישנה הכי הרבה זמן ביום?", a: "קואלה (כ-22 שעות)" }, { q: "כמה זוגות כנפיים יש לזבוב?", a: "זוג אחד" }, { q: "איזו חיה מסוגלת לסובב את ראשה ב-270 מעלות?", a: "ינשוף" }, { q: "ממה עשויה קרן של קרנף?", a: "קראטין (כמו שיער וציפורניים)" }, { q: "איזה גז אנחנו נושמים כדי לחיות?", a: "חמצן" }, { q: "מהו המזון העיקרי של דב הפנדה?", a: "במבוק" } ],
    general: [ { q: "איזה חודש בלוח העברי תמיד מונה 29 ימים?", a: "טבת (או תמוז/אלול)" }, { q: "כמה שעות יש בשבוע שלם?", a: "168 שעות" }, { q: "מי המציא את נורת החשמל?", a: "תומאס אדיסון" }, { q: "באיזו עיר נמצאים קברי אבות האומה?", a: "חברון (מערת המכפלה)" }, { q: "כמה ברכות יש בתפילת עמידה של חול?", a: "19" }, { q: "מהי המדינה הגדולה ביותר בעולם בשטחה?", a: "רוסיה" }, { q: "כמה כוכבי לכת יש במערכת השמש שלנו?", a: "8" }, { q: "איזה ים נמצא בנקודה הנמוכה ביותר בעולם?", a: "ים המלח" }, { q: "מהו הסמל הכימי של זהב?", a: "Au" }, { q: "מי כתב את 'מסילת ישרים'?", a: "הרמח\"ל" }, { q: "באיזו עיר בעולם נמצא ה'ביג בן'?", a: "לונדון" }, { q: "איזה יסוד מסומן באות O?", a: "חמצן" }, { q: "מהו האוקיינוס הגדול ביותר?", a: "האוקיינוס השקט" }, { q: "מי המציא את מכשיר הטלפון הראשון?", a: "אלכסנדר גרהם בל" }, { q: "נכון או לא נכון: הברק לא פוגע פעמיים באותו מקום.", a: "לא נכון (פוגע במקומות גבוהים פעמים רבות)" }, { q: "נכון או לא נכון: תפוח צף במים כי 25% מהנפח שלו זה אוויר.", a: "נכון" }, { q: "איזו מדינה באירופה מזכירה בצורתה מגף?", a: "איטליה" }, { q: "מהו השם שניתן ליחידה הבסיסית ביותר של כל יצור חי?", a: "תא" }, { q: "כמה שיניים יש לאדם בוגר בדרך כלל?", a: "32" }, { q: "באיזו עיר בעולם נמצא מגדל אייפל?", a: "פריז" }, { q: "מהי הטמפרטורה שבה מים רותחים?", a: "100 מעלות צלזיוס" }, { q: "איזה חודש לועזי הוא הקצר ביותר?", a: "פברואר" }, { q: "מהו שמו של המבצר ליד שער יפו בירושלים?", a: "מגדל דוד" }, { q: "מה מתקבל מערבוב של כחול וצהוב?", a: "ירוק" }, { q: "באיזו יבשת נמצאות הפירמידות?", a: "אפריקה" }, { q: "כמה שנים נמשכה גלות בבל הראשונה?", a: "70 שנה" }, { q: "איזה כוכב לכת מכונה 'הכוכב האדום'?", a: "מאדים" }, { q: "מי חיבר את הפיוט 'ידיד נפש'?", a: "רבי אלעזר אזכרי" }, { q: "נכון או לא נכון: אפשר לעטוף נייר A4 יותר מ-7 פעמים.", a: "לא נכון" }, { q: "מהי היבשת הקטנה ביותר בעולם?", a: "אוסטרליה" }, { q: "באיזו עיר נמצא מוסד ה'טכניון'?", a: "חיפה" }, { q: "מי המציא את כתב העיוורים?", a: "לואי ברייל" }, { q: "מהו הנהר הארוך ביותר בארץ ישראל?", a: "הירדן" }, { q: "איזו עיר בישראל ידועה כ'עיר המקובלים'?", a: "צפת" }, { q: "מהו מצב הצבירה של קרח?", a: "מוצק" }, { q: "מאיזה חומר טבעי מפיקים גומי?", a: "שרף של עץ הגומי" }, { q: "איזה יצור ימי אינו דג, אינטליגנטי ומניק?", a: "דולפין" }, { q: "מהו ההר הגבוה בעולם?", a: "האוורסט" }, { q: "איזה בעל חיים הוא הגדול ביותר כיום?", a: "לווייתן כחול" }, { q: "כמה צבעים בקשת בענן?", a: "7" }, { q: "מהו המדבר הגדול בעולם?", a: "סהרה" }, { q: "מה כוח המשיכה שגורם לדברים ליפול?", a: "כוח הכבידה (גרביטציה)" }, { q: "באיזו שפה נכתב הכוזרי במקור?", a: "ערבית יהודית" }, { q: "איזו מדינה הכי גדולה במספר תושביה?", a: "הודו (או סין)" }, { q: "איזה איבר מנקה רעלים מהדם?", a: "כבד" }, { q: "כמה יבשות יש בעולם?", a: "7" }, { q: "איזו עיר מכונה 'התפוח הגדול'?", a: "ניו יורק" }, { q: "מהו כלי הנגינה עם הכי הרבה מיתרים?", a: "פסנתר" }, { q: "איזו מתכת נוזלית בטמפרטורת החדר?", a: "כספית" }, { q: "מי המציא את המטוס הראשון?", a: "האחים רייט" } ],
    funny: [ { q: "מה יש לו שיניים אבל הוא לא יכול לנשוך?", a: "מסרק" }, { q: "מה נהיה רטוב יותר ככל שהוא מייבש יותר?", a: "מגבת" }, { q: "מה שייך לך, אבל כולם משתמשים בו הרבה יותר ממך?", a: "השם שלך" }, { q: "לאיזו שאלה אי אפשר לענות ב'כן'?", a: "האם אתה ישן עכשיו?" }, { q: "מה עולה ויורד אבל תמיד נשאר באותו מקום?", a: "מעלית" }, { q: "מה יש לו רגליים אבל הוא לא יכול ללכת?", a: "שולחן" }, { q: "איזה חודש בשנה יש בו 28 ימים?", a: "כולם!" }, { q: "מה נשבר ברגע שאומרים את השם שלו?", a: "שקט" }, { q: "מה מלא חורים אבל עדיין מחזיק מים?", a: "ספוג" }, { q: "מה יש לו עין אחת אבל הוא לא רואה כלום?", a: "מחט" }, { q: "מה חייבים לשבור לפני שמשתמשים בו?", a: "ביצה" }, { q: "לאיזה עץ אין עלים ואין ענפים?", a: "עץ משפחה" }, { q: "מה נכנס למים אדום ויוצא שחור?", a: "ברזל מלובן" }, { q: "מה רץ בכל הבית אבל אין לו רגליים?", a: "קירות / או זרם חשמל" }, { q: "מה יש לו צוואר אבל אין לו ראש?", a: "בקבוק" }, { q: "מה אפשר לתת למישהו אחר ועדיין להישאר איתו?", a: "חיוך / מחמאה" }, { q: "מה הולך על ארבע בבוקר, על שתיים בצהריים ועל שלוש בערב?", a: "האדם (תינוק, מבוגר, וזקן)" }, { q: "מה אפשר לתפוס אבל אי אפשר לזרוק?", a: "נזלת / צינון" }, { q: "מה נהיה קטן יותר בכל פעם שהוא מתרחץ?", a: "סבון" }, { q: "מה יש לו הרבה מילים אבל הוא אף פעם לא מדבר?", a: "ספר / מילון" }, { q: "מה הולך קדימה אבל משאיר עקבות אחורה?", a: "נעליים" }, { q: "מה עומד על רגל אחת והראש שלו בשמיים?", a: "פנס רחוב" }, { q: "מה יש לו אלף שערות והוא לא מתרחץ?", a: "מטאטא" }, { q: "מה אפשר להחזיק ביד ימין אבל אף פעם לא ביד שמאל?", a: "את מרפק שמאל שלך" }, { q: "מה גדל למטה כשהוא גדל למעלה?", a: "נטיף קרח" }, { q: "איזה מפתח לא יכול לפתוח שום דלת?", a: "מפתח סול (במוזיקה)" }, { q: "איזה כוח יש לכל אחד, אפילו לתינוק, להרים פיל?", a: "אין כזה כוח" }, { q: "מה יש לו לב אבל אין לו איברים אחרים?", a: "ארטישוק / או חבילת קלפים" }, { q: "מי יכול לדבר בכל השפות בעולם?", a: "הד (Echo)" }, { q: "מה עולה אבל אף פעם לא יורד?", a: "הגיל שלך" }, { q: "מה יש לו ערים בלי בתים, והרים בלי עצים?", a: "מפה" }, { q: "מה נהיה ארוך יותר כשמושכים אותו, אבל קצר יותר כשמשתמשים בו?", a: "סיגריה / נר" }, { q: "איזו רכבת נוסעת בלי גלגלים ובלי פסים?", a: "רכבת מחשבות" }, { q: "מה אפשר למצוא פעם אחת בדקה, פעמיים ברגע ואף פעם לא באלף שנה?", a: "האות ק'" }, { q: "למה האריה אכל את המנצח בתחרות?", a: "כי הפרס הוא ארוחה עם המנצח" }, { q: "מה משותף לעגבנייה ופיל?", a: "שניהם אדומים, חוץ מהפיל" }, { q: "מה יותר כבד - קילו ברזל או קילו נוצות?", a: "שניהם שוקלים קילו" }, { q: "איך אפשר לעבור את ים סוף בלי להירטב?", a: "בטיסה" }, { q: "מה יש לו גב וארבע רגליים אבל לא יכול לזוז?", a: "כיסא" }, { q: "מה נכנס דרך החלון הסגור בלי לשבור אותו?", a: "אור השמש" }, { q: "איזה איש לא יכול לחיות בבית?", a: "איש שלג" }, { q: "מה עובר דרך ערים ושדות, אבל לא זז אף פעם?", a: "כביש" }, { q: "למי יש פה אבל הוא לא אוכל, ומיטה אבל הוא לא ישן?", a: "נהר" }, { q: "מה אפשר להחזיק בלי לגעת בו בידיים?", a: "שיחה / הבטחה" }, { q: "מה גדל בלי שורשים?", a: "ציפורניים / שיער" }, { q: "איזה סוג של אבן אף פעם לא נמצא בים?", a: "אבן יבשה" }, { q: "מה נהיה גבוה יותר ככל שחופרים בו יותר?", a: "בור" }, { q: "מה רואה הכל אבל אין לו עיניים?", a: "מראה" }, { q: "מה המשותף לאזעקה ולמורה למתמטיקה?", a: "שניהם גורמים לכולם לרוץ." }, { q: "מה יש לו ראש אבל לא יכול לחשוב?", a: "כרובית" } ]
};

let db = { 
    phonebooks: {}, savedGames: {}, pins: {}, vouchers: {}, messages: [], 
    portalMsg: { permanent: "ברוכים הבאים למערכת ההפעלות המובילה בישראל!", temporary: "" }, 
    ads: { projectors: [], computers: [], phones: [], general: [] },
    publicExcels: [], 
    analytics: { portal: 0, audience: 0, admin: 0, arena: 0, desk: 0, adClicks: 0 },
    myDesk: { links: [], passwords: [], tasks: [], files: [] },
    arenaQuestions: defaultArenaQuestions
};

try { 
    if (fs.existsSync(DB_PATH)) {
        let data = fs.readFileSync(DB_PATH, 'utf8');
        if (data.trim() !== '') {
            let parsed = JSON.parse(data);
            db = { ...db, ...parsed }; 
            if(!db.analytics) db.analytics = { portal: 0, audience: 0, admin: 0, arena: 0, desk: 0, adClicks: 0 }; 
            if(!db.analytics.adClicks) db.analytics.adClicks = 0;
            if(!db.arenaQuestions || !db.arenaQuestions.family || db.arenaQuestions.family.length < 5) { db.arenaQuestions = defaultArenaQuestions; saveDB(); }
            if(!db.portalMsg || typeof db.portalMsg === 'string') db.portalMsg = { permanent: db.portalMsg, temporary: "" };
            if(!db.ads) db.ads = { projectors: [], computers: [], phones: [], general: [] };
        }
    }
} catch(e) {}

function saveDB() { try { fs.writeFileSync(DB_PATH, JSON.stringify(db)); } catch(e){} }

let rooms = {}; let callToRoom = {}; let arenaRooms = {}; let arenaCallToRoom = {}; 

function getRoom(roomId) {
    if (!rooms[roomId]) {
        rooms[roomId] = {
            activePlayers: {}, questions: [], currentQuestion: -1, gameActive: false, answersLocked: true, isDoublePoints: false, 
            gameSettings: { gameName: "קליקינט", phoneNumber: "077-2296674", sponsorUrl: "", isPremium: (db.pins[roomId]?.type === 'premium' || db.pins[roomId]?.type === 'gold'), isGold: (db.pins[roomId]?.type === 'gold') },
            calibrationState: 'off', calibrationStartTime: 0, questionStartTime: 0, timerTimeout: null,
            createdAt: Date.now(), lastActivity: Date.now() // הוספנו חותמות זמן
        };
        if (!db.phonebooks[roomId]) db.phonebooks[roomId] = {};
        if (!db.savedGames[roomId]) db.savedGames[roomId] = {};
        saveDB();
    }
    return rooms[roomId];
}

// 🧹 מנקה חדרים מתים (10 שעות ללא פעילות)
setInterval(() => {
    let now = Date.now();
    const TEN_HOURS = 10 * 60 * 60 * 1000;
    for (let r in rooms) { if (now - (rooms[r].lastActivity || rooms[r].createdAt || now) > TEN_HOURS) { delete rooms[r]; } }
    for (let r in arenaRooms) { if (now - (arenaRooms[r].lastActivity || arenaRooms[r].createdAt || now) > TEN_HOURS) { delete arenaRooms[r]; } }
}, 30 * 60 * 1000); // בודק כל חצי שעה

// ניתובים
app.get('/', (req, res) => { db.analytics.portal++; saveDB(); emitSuperData(); res.sendFile(__dirname + '/portal.html'); });
app.get('/portal', (req, res) => { res.redirect(301, '/'); }); 
app.get('/play', (req, res) => { db.analytics.audience++; saveDB(); emitSuperData(); res.sendFile(__dirname + '/index.html'); });
app.get('/admin', (req, res) => { db.analytics.admin++; saveDB(); emitSuperData(); res.sendFile(__dirname + '/admin.html'); });
app.get('/arena', (req, res) => { db.analytics.arena++; saveDB(); emitSuperData(); res.sendFile(__dirname + '/arena.html'); });
app.get('/desk', (req, res) => { db.analytics.desk++; saveDB(); emitSuperData(); res.sendFile(__dirname + '/desk.html'); });
app.get('/super', (req, res) => res.sendFile(__dirname + '/superadmin.html')); 

// API טריוויה
app.all('/api/answer', (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    try {
        const exactHitTime = Date.now(); const input = { ...req.query, ...req.body };
        const phone = input.ApiPhone || "unknown"; const callId = input.ApiCallId || "unknown_call"; 
        let valRaw = input.val_1; let val = "";
        if (Array.isArray(valRaw)) val = valRaw[valRaw.length - 1]; else if (typeof valRaw === 'string') val = valRaw.split(',').pop().trim();
        
        if (val === '*') { delete callToRoom[callId]; return res.send("read=t-נא להקיש קוד משחק וסולמית=val_1,no,10,1,15,no,no"); }

        let roomId = callToRoom[callId];
        if (!roomId) {
            if (val !== undefined && val !== '') {
                if (!db.pins[val]) return res.send(`read=t-קוד שגוי נא לנסות שוב=val_1,no,10,1,15,no,no`);
                if (db.pins[val].expiresAt && exactHitTime > db.pins[val].expiresAt) return res.send(`id_list_message=t-תוקף הקוד פג&go_to_folder=hangup`);
                if (db.pins[val].gamesLeft <= 0) return res.send(`id_list_message=t-הקוד סיים מכסה&go_to_folder=hangup`);
                callToRoom[callId] = val; const room = getRoom(val); room.lastActivity = Date.now();
                if (!room.activePlayers[phone]) { room.activePlayers[phone] = { name: db.phonebooks[val]?.[phone] || "שחקן חדש", score: 0, lastAnswered: -1, ping: 0, streak: 0, lastBreakdown: "" }; io.to(val).emit('updateLeaderboard', room.activePlayers); }
                return res.send(`id_list_message=t-מחובר בהצלחה&read=t-ממתין=val_1,no,1,1,10,no,no`);
            } else { return res.send("read=t-ברוכים הבאים הקישו קוד משחק וסולמית=val_1,no,10,1,15,no,no"); }
        }

        const room = getRoom(roomId); room.lastActivity = Date.now();
        let player = room.activePlayers[phone];
        if (!player) { room.activePlayers[phone] = { name: db.phonebooks[roomId]?.[phone] || "שחקן חדש", score: 0, lastAnswered: -1, ping: 0, streak: 0, lastBreakdown: "" }; player = room.activePlayers[phone]; io.to(roomId).emit('updateLeaderboard', room.activePlayers); }
        if (!val || val === '') return res.send(`read=t-ממתין=val_1,no,1,1,10,no,no`);

        if (val && val !== '') {
            if (room.gameActive && !room.answersLocked && room.currentQuestion >= 0) {
                let q = room.questions[room.currentQuestion];
                if (player.lastAnswered !== room.currentQuestion) {
                    player.lastAnswered = room.currentQuestion; player.currentChoice = val; 
                    if (q.ans && val === String(q.ans)) {
                        let netTime = Math.max(100, (exactHitTime - room.questionStartTime) - (player.ping || 0)); 
                        let multiplier = room.isDoublePoints ? 2 : 1; let baseScore = 100 * multiplier; let speedBonus = Math.max(0, 100 - Math.floor(netTime / 1000)) * multiplier;
                        player.streak = (player.streak || 0) + 1; let streakBonus = (player.streak > 1) ? (player.streak * 15) : 0; 
                        player.score += (baseScore + speedBonus + streakBonus); player.lastBreakdown = `✅ ענה נכון! | ${room.isDoublePoints?'דאבל!':''} +${baseScore+speedBonus+streakBonus}`;
                    } else { player.streak = 0; player.lastBreakdown = `❌ טעות (בחר ${val})`; }
                    io.to(roomId).emit('updateLeaderboard', room.activePlayers);
                }
                return res.send(`id_list_message=t-תשובה נקלטה&read=t-ממתין=val_1,no,1,1,10,no,no`);
            }
            if (room.answersLocked) return res.send(`id_list_message=t-המענה סגור כעת&read=t-ממתין=val_1,no,1,1,10,no,no`);
            return res.send(`id_list_message=t-נקלט&read=t-ממתין=val_1,no,1,1,10,no,no`);
        }
    } catch(err) { res.send("id_list_message=t-שגיאה וניתוק&go_to_folder=hangup"); }
});

// API זירה
app.all('/api/arena', (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    try {
        const input = { ...req.query, ...req.body }; const phone = input.ApiPhone || "unknown"; const callId = input.ApiCallId || "unknown_call"; 
        let valRaw = input.val_1; let val = ""; if (Array.isArray(valRaw)) val = valRaw[valRaw.length - 1]; else if (typeof valRaw === 'string') val = valRaw.split(',').pop().trim();
        
        if (val === '*') { delete arenaCallToRoom[callId]; return res.send("read=t-הקש קוד משחק וסולמית=val_1,no,10,1,15,no,no"); }

        let roomId = arenaCallToRoom[callId];
        if (!roomId) {
            if (val !== undefined && val !== '') {
                if (!db.pins[val]) return res.send(`read=t-קוד שגוי נא לנסות שוב=val_1,no,10,1,15,no,no`);
                arenaCallToRoom[callId] = val; 
                if (!arenaRooms[val]) arenaRooms[val] = { players: {}, phase: 'lobby', createdAt: Date.now(), lastActivity: Date.now() }; 
                const room = arenaRooms[val]; room.lastActivity = Date.now();
                if (!room.players[phone]) { room.players[phone] = { name: db.phonebooks[val]?.[phone] || "שחקן חדש", phone: phone, score: 0, currentVote: 0 }; io.to('arena_'+val).emit('arenaUpdatePlayers', room.players); }
                return res.send(`id_list_message=t-מחובר לזירה&read=t-ממתין=val_1,no,10,1,10,no,no`); 
            } else { return res.send("read=t-ברוכים הבאים לזירה הקישו קוד משחק וסולמית=val_1,no,10,1,15,no,no"); }
        }

        const room = arenaRooms[roomId]; room.lastActivity = Date.now();
        if (!room.players[phone]) { room.players[phone] = { name: db.phonebooks[roomId]?.[phone] || "שחקן חדש", phone: phone, score: 0, currentVote: 0 }; io.to('arena_'+roomId).emit('arenaUpdatePlayers', room.players); }
        if (!val || val === '') return res.send(`read=t-ממתין=val_1,no,10,1,10,no,no`);

        let numVal = parseInt(val);
        if (!isNaN(numVal) && numVal >= 1 && numVal <= 10) {
            if (room.phase === 'rating') {
                room.players[phone].currentVote = numVal; io.to('arena_'+roomId).emit('arenaVoteReceived', { phone: phone, vote: numVal });
                return res.send(`id_list_message=t-הדירוג נקלט&read=t-ממתין=val_1,no,10,1,10,no,no`);
            } else { return res.send(`id_list_message=t-ההצבעה סגורה כעת&read=t-ממתין=val_1,no,10,1,10,no,no`); }
        }
        return res.send(`read=t-ממתין=val_1,no,10,1,10,no,no`);
    } catch(err) { res.send("id_list_message=t-שגיאה וניתוק&go_to_folder=hangup"); }
});

function emitSuperData() { io.emit('superData', { pins: db.pins, vouchers: db.vouchers, messages: db.messages, portalMsg: db.portalMsg, ads: db.ads, publicExcels: db.publicExcels, analytics: db.analytics, arenaQuestions: db.arenaQuestions }); }
function emitPortalData() { io.emit('portalData', { msg: db.portalMsg, ads: db.ads, excels: db.publicExcels }); }

io.on('connection', (socket) => {
    
    socket.on('adClicked', () => { db.analytics.adClicks++; saveDB(); emitSuperData(); });
    socket.on('updatePortalMsgs', data => { db.portalMsg.permanent = data.perm; db.portalMsg.temporary = data.temp; saveDB(); emitPortalData(); emitSuperData(); });
    socket.on('addAd', data => { if (data.imgBase64) { const base64Data = data.imgBase64.replace(/^data:image\/\w+;base64,/, ""); const fileName = 'ad_' + Date.now() + '.png'; fs.writeFileSync('uploads/' + fileName, base64Data, 'base64'); db.ads[data.category].push({ img: '/uploads/' + fileName, link: data.link }); saveDB(); emitPortalData(); emitSuperData(); } });
    socket.on('deleteAd', data => { db.ads[data.category].splice(data.index, 1); saveDB(); emitPortalData(); emitSuperData(); });

    socket.on('updateArenaQuestions', data => { db.arenaQuestions = data; saveDB(); emitSuperData(); });
    socket.on('killRoom', data => { if(data.type === 'trivia') { delete rooms[data.roomId]; } else if (data.type === 'arena') { delete arenaRooms[data.roomId]; } emitSuperData(); });
    socket.on('sendSystemMessage', data => { let payload = { msg: data.msg, allowReply: data.reply }; if (data.room === 'all') { io.emit('sysMessage', payload); io.emit('arenaSysMessage', payload); } else { io.to(data.room).emit('sysMessage', payload); io.to('arena_' + data.room).emit('arenaSysMessage', payload); } });

    socket.on('deskLogin', (pass) => { if (pass === "TCRHNHCUHTR") { socket.emit('deskData', db.myDesk); } else { socket.emit('deskError'); } });
    socket.on('deskUpdateData', (newData) => { db.myDesk.links = newData.links || db.myDesk.links; db.myDesk.passwords = newData.passwords || db.myDesk.passwords; db.myDesk.tasks = newData.tasks || db.myDesk.tasks; saveDB(); socket.emit('deskData', db.myDesk); });
    socket.on('deskUploadFile', data => { if(data.base64) { const base64Data = data.base64.replace(/^data:.*?;base64,/, ""); const fileName = 'desk_file_' + Date.now() + '_' + data.name; fs.writeFileSync('uploads/' + fileName, base64Data, 'base64'); db.myDesk.files.push({ name: data.name, url: '/uploads/' + fileName }); saveDB(); socket.emit('deskData', db.myDesk); } });
    socket.on('deskDeleteFile', index => { if(db.myDesk.files[index]) { const filePath = 'uploads/' + db.myDesk.files[index].url.split('/').pop(); if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); } db.myDesk.files.splice(index, 1); saveDB(); socket.emit('deskData', db.myDesk); } });

    socket.on('getPortalData', () => { emitPortalData(); });
    socket.on('superLogin', (pass) => { if (pass === "Ahal2026!") emitSuperData(); else socket.emit('superError'); });
    socket.on('uploadPublicExcel', data => { if(data.base64) { const base64Data = data.base64.replace(/^data:.*?;base64,/, ""); const fileName = 'excel_' + Date.now() + '.xlsx'; fs.writeFileSync('uploads/' + fileName, base64Data, 'base64'); db.publicExcels.push({ name: data.name, url: '/uploads/' + fileName }); saveDB(); emitPortalData(); emitSuperData(); } });
    socket.on('deletePublicExcel', index => { if(db.publicExcels[index]) { db.publicExcels.splice(index, 1); saveDB(); emitPortalData(); emitSuperData(); } });

    socket.on('createBulkPins', (data) => { let start = parseInt(data.start); let end = data.end ? parseInt(data.end) : start; let initialGames = data.type === 'gold' ? 9999 : 3; for(let i = start; i <= end; i++) { db.pins[i.toString()] = { type: data.type, gamesLeft: initialGames, created: new Date().toLocaleDateString('he-IL'), expiresAt: data.expiresAt }; } saveDB(); emitSuperData(); });
    socket.on('deletePin', (pin) => { delete db.pins[pin]; saveDB(); emitSuperData(); });
    socket.on('createVoucher', data => { db.vouchers[data.code] = { type: data.type, days: parseInt(data.days), used: false, isPublic: data.isPublic || false, usesCount: 0, created: new Date().toLocaleDateString('he-IL') }; saveDB(); emitSuperData(); });
    socket.on('deleteVoucher', code => { delete db.vouchers[code]; saveDB(); emitSuperData(); });
    socket.on('redeemVoucher', code => { let v = db.vouchers[code]; if(v && (!v.used || v.isPublic)) { let newPin; do { newPin = Math.floor(10000 + Math.random() * 90000).toString(); } while(db.pins[newPin]); let expiresAt = Date.now() + (v.days * 24 * 60 * 60 * 1000); db.pins[newPin] = { type: v.type, gamesLeft: (v.type==='gold'?9999:3), created: new Date().toLocaleDateString('he-IL'), expiresAt: expiresAt }; if (v.isPublic) { v.usesCount = (v.usesCount || 0) + 1; } else { v.used = true; v.generatedPin = newPin; } saveDB(); socket.emit('voucherResult', { success: true, pin: newPin, type: v.type, days: v.days }); emitSuperData(); } else { socket.emit('voucherResult', { success: false, error: 'קוד שגוי או שומש.' }); } });

    socket.on('submitMessage', msg => { if(!db.messages) db.messages = []; db.messages.push({ date: new Date().toLocaleString('he-IL'), name: msg.name, text: msg.text }); saveDB(); socket.emit('messageResult', { success: true }); emitSuperData(); });
    socket.on('deleteMessage', index => { if(db.messages && db.messages[index]) { db.messages.splice(index, 1); saveDB(); emitSuperData(); } });

    // 👁️ הרדאר המעודכן - עם מניית שאלות ומיון לפי תאריך!
    socket.on('fetchLiveStats', () => { 
        let stats = {}; 
        for (let r in rooms) { 
            let activeCount = Object.keys(rooms[r].activePlayers).length; 
            if (activeCount > 0 || rooms[r].gameActive || rooms[r].questions.length > 0) { 
                stats[r] = { type: 'trivia', players: activeCount, isActive: rooms[r].gameActive, qCount: rooms[r].questions.length, currentQ: rooms[r].currentQuestion + 1, playersData: rooms[r].activePlayers, createdAt: rooms[r].createdAt || Date.now() }; 
            } 
        }
        for (let r in arenaRooms) { 
            let activeCount = Object.keys(arenaRooms[r].players).length; 
            if (activeCount > 0 || arenaRooms[r].phase !== 'lobby') { 
                stats[r] = { type: 'arena', players: activeCount, isActive: (arenaRooms[r].phase !== 'lobby'), phase: arenaRooms[r].phase, playersData: arenaRooms[r].players, createdAt: arenaRooms[r].createdAt || Date.now() }; 
            } 
        }
        let calls = { trivia: callToRoom, arena: arenaCallToRoom };
        socket.emit('liveStatsData', { stats: stats, calls: calls }); 
    });

    // --- טריוויה ---
    socket.on('joinRoom', (roomId) => { if (!db.pins[roomId]) return socket.emit('loginResponse', { success: false, error: 'קוד לא קיים!' }); if (db.pins[roomId].expiresAt && Date.now() > db.pins[roomId].expiresAt) return socket.emit('loginResponse', { success: false, error: 'הקוד פג תוקף!' }); socket.join(roomId); socket.roomId = roomId; const room = getRoom(roomId); room.lastActivity = Date.now(); let gamesDisplay = (db.pins[roomId].type === 'gold') ? 'ללא הגבלה 👑' : db.pins[roomId].gamesLeft; socket.emit('loginResponse', { success: true, gamesLeft: gamesDisplay }); socket.emit('updateSettings', room.gameSettings); socket.emit('updateLeaderboard', room.activePlayers); socket.emit('lockState', room.answersLocked); socket.emit('updateQuestions', room.questions); socket.emit('doublePointsState', room.isDoublePoints); });
    socket.on('startGame', () => { if(!socket.roomId) return; let room = rooms[socket.roomId]; if(room.questions.length === 0) return; if (db.pins[socket.roomId].type !== 'gold') { db.pins[socket.roomId].gamesLeft--; saveDB(); } let gamesDisplay = (db.pins[socket.roomId].type === 'gold') ? 'ללא הגבלה 👑' : db.pins[socket.roomId].gamesLeft; io.to(socket.roomId).emit('updateGamesLeft', gamesDisplay); room.gameActive = true; room.currentQuestion = 0; room.answersLocked = true; room.isDoublePoints = false; room.lastActivity = Date.now(); for(let p in room.activePlayers) { room.activePlayers[p].score = 0; room.activePlayers[p].lastAnswered = -1; room.activePlayers[p].streak = 0; room.activePlayers[p].currentChoice = null; } io.to(socket.roomId).emit('doublePointsState', false); io.to(socket.roomId).emit('newQuestion', room.questions[room.currentQuestion]); io.to(socket.roomId).emit('lockState', true); io.to(socket.roomId).emit('updateLeaderboard', room.activePlayers); });
    socket.on('addSingleQuestion', q => { if(socket.roomId) { if (q.imgBase64) { const base64Data = q.imgBase64.replace(/^data:image\/\w+;base64,/, ""); const fileName = 'img_' + Date.now() + '.png'; fs.writeFileSync('uploads/' + fileName, base64Data, 'base64'); q.image = '/uploads/' + fileName; delete q.imgBase64; } rooms[socket.roomId].questions.push(q); rooms[socket.roomId].lastActivity = Date.now(); io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions); } });
    socket.on('deleteSingleQuestion', index => { if(socket.roomId && rooms[socket.roomId].questions[index]) { rooms[socket.roomId].questions.splice(index, 1); io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions); } });
    socket.on('kickPlayer', phone => { if(socket.roomId && rooms[socket.roomId].activePlayers[phone]) { delete rooms[socket.roomId].activePlayers[phone]; io.to(socket.roomId).emit('updateLeaderboard', rooms[socket.roomId].activePlayers); } });
    socket.on('uploadSponsor', data => { if(socket.roomId && rooms[socket.roomId].gameSettings.isGold && data.imgBase64) { const base64Data = data.imgBase64.replace(/^data:image\/\w+;base64,/, ""); const fileName = 'sponsor_' + socket.roomId + '_' + Date.now() + '.png'; fs.writeFileSync('uploads/' + fileName, base64Data, 'base64'); rooms[socket.roomId].gameSettings.sponsorUrl = '/uploads/' + fileName; io.to(socket.roomId).emit('updateSettings', rooms[socket.roomId].gameSettings); } });
    socket.on('toggleDoublePoints', isDouble => { if(socket.roomId) { rooms[socket.roomId].isDoublePoints = isDouble; io.to(socket.roomId).emit('doublePointsState', isDouble); } });
    socket.on('showChart', () => { if(socket.roomId) { let room = rooms[socket.roomId]; let counts = {1:0, 2:0, 3:0, 4:0}; for(let p in room.activePlayers) { let c = room.activePlayers[p].currentChoice; if(c && counts[c] !== undefined) counts[c]++; } io.to(socket.roomId).emit('displayChart', counts); } });
    socket.on('revealAnswer', () => { if(socket.roomId && rooms[socket.roomId].currentQuestion >= 0 && rooms[socket.roomId].currentQuestion < rooms[socket.roomId].questions.length) { io.to(socket.roomId).emit('showCorrectAnswer', rooms[socket.roomId].questions[rooms[socket.roomId].currentQuestion].ans); } });
    socket.on('triggerEffect', type => { if(socket.roomId) io.to(socket.roomId).emit('playEffect', type); });
    socket.on('toggleMusic', state => { if(socket.roomId) io.to(socket.roomId).emit('musicState', state); });
    socket.on('addBulkQuestions', qs => { if(socket.roomId) { rooms[socket.roomId].questions = rooms[socket.roomId].questions.concat(qs); rooms[socket.roomId].lastActivity = Date.now(); io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions); } });
    socket.on('clearQuestions', () => { if(socket.roomId) { rooms[socket.roomId].questions = []; io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions); } });
    socket.on('saveGameToBank', name => { if(socket.roomId) { db.savedGames[socket.roomId][name] = [...rooms[socket.roomId].questions]; saveDB(); io.to(socket.roomId).emit('updateSavedGames', Object.keys(db.savedGames[socket.roomId])); } });
    socket.on('loadGameFromBank', name => { if(socket.roomId && db.savedGames[socket.roomId][name]) { rooms[socket.roomId].questions = [...db.savedGames[socket.roomId][name]]; io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions); } });
    socket.on('deleteGameFromBank', name => { if(socket.roomId) { delete db.savedGames[socket.roomId][name]; saveDB(); io.to(socket.roomId).emit('updateSavedGames', Object.keys(db.savedGames[socket.roomId])); } });
    socket.on('toggleLock', lock => { if(socket.roomId) { rooms[socket.roomId].answersLocked = lock; if(lock && rooms[socket.roomId].timerTimeout) clearTimeout(rooms[socket.roomId].timerTimeout); io.to(socket.roomId).emit('lockState', rooms[socket.roomId].answersLocked); } });
    socket.on('startTimer', sec => { if(socket.roomId) { let room = rooms[socket.roomId]; room.answersLocked = false; room.questionStartTime = Date.now(); io.to(socket.roomId).emit('lockState', false); io.to(socket.roomId).emit('startCountdown', sec); if(room.timerTimeout) clearTimeout(room.timerTimeout); room.timerTimeout = setTimeout(() => { room.answersLocked = true; io.to(socket.roomId).emit('lockState', true); io.to(socket.roomId).emit('playEffect', 'shake'); }, sec * 1000); } });
    socket.on('nextQuestion', () => { if(socket.roomId) { let room = rooms[socket.roomId]; room.currentQuestion++; room.lastActivity = Date.now(); if (room.currentQuestion < room.questions.length) { room.answersLocked = true; room.isDoublePoints = false; io.to(socket.roomId).emit('doublePointsState', false); for(let p in room.activePlayers) room.activePlayers[p].currentChoice = null; io.to(socket.roomId).emit('newQuestion', room.questions[room.currentQuestion]); io.to(socket.roomId).emit('lockState', true); } else { room.gameActive = false; room.answersLocked = true; io.to(socket.roomId).emit('gameOver'); } } });
    socket.on('prevQuestion', () => { if(socket.roomId) { let room = rooms[socket.roomId]; if (room.currentQuestion > 0) { room.currentQuestion--; room.lastActivity = Date.now(); room.answersLocked = true; room.isDoublePoints = false; io.to(socket.roomId).emit('doublePointsState', false); for(let p in room.activePlayers) room.activePlayers[p].currentChoice = null; io.to(socket.roomId).emit('newQuestion', room.questions[room.currentQuestion]); io.to(socket.roomId).emit('lockState', true); } } });
    socket.on('showVictoryScreen', () => { if(socket.roomId) { let room = rooms[socket.roomId]; room.gameActive = false; room.answersLocked = true; io.to(socket.roomId).emit('lockState', true); const topPlayers = Object.values(room.activePlayers).sort((a,b) => b.score - a.score).slice(0, 3); io.to(socket.roomId).emit('victoryPodium', topPlayers); } });
    socket.on('updatePlayerName', ({ phone, newName }) => { if(socket.roomId) { db.phonebooks[socket.roomId][phone] = newName; saveDB(); if (rooms[socket.roomId].activePlayers[phone]) rooms[socket.roomId].activePlayers[phone].name = newName; io.to(socket.roomId).emit('updateLeaderboard', rooms[socket.roomId].activePlayers); } });

    socket.on('getArenaQuestions', () => { socket.emit('arenaQuestionsData', db.arenaQuestions); }); 
    socket.on('joinArenaRoom', roomId => { if (!db.pins[roomId]) return socket.emit('loginResponse', { success: false, error: 'קוד מפיק לא קיים!' }); if (db.pins[roomId].expiresAt && Date.now() > db.pins[roomId].expiresAt) return socket.emit('loginResponse', { success: false, error: 'הקוד פג תוקף!' }); socket.join('arena_' + roomId); if (!arenaRooms[roomId]) arenaRooms[roomId] = { players: {}, phase: 'lobby', createdAt: Date.now(), lastActivity: Date.now() }; arenaRooms[roomId].lastActivity = Date.now(); socket.emit('loginResponse', { success: true }); socket.emit('arenaUpdatePlayers', arenaRooms[roomId].players); });
    socket.on('arenaSetPhase', data => { if(arenaRooms[data.roomId]) { arenaRooms[data.roomId].phase = data.phase; arenaRooms[data.roomId].lastActivity = Date.now(); } });
    socket.on('arenaUpdateScores', data => { if(arenaRooms[data.roomId]) arenaRooms[data.roomId].players = data.players; });
    socket.on('arenaUpdatePlayerName', data => { if(arenaRooms[data.roomId]) { db.phonebooks[data.roomId] = db.phonebooks[data.roomId] || {}; db.phonebooks[data.roomId][data.phone] = data.name; saveDB(); if(arenaRooms[data.roomId].players[data.phone]) arenaRooms[data.roomId].players[data.phone].name = data.name; } });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log("=== Clickinet V72.0 (Radar Upgrade) is ONLINE ==="));
