- vibecoded a scheduling tool for myself


- takes exam schedules from unitime for any class specified

- in this case i targeted underclassmen in cs & cd adj courses such as cs180, ma161, ma162 until sophomore year courses
- helps u schedule events not on dates of major exams, and manual entry of other competing club event dates can be added
- output to google calender and displayed via google Oauth + google calender api


- university academic calendar (breaks, closures, finals, holidays) is loaded from backend/data/academic_calendar.json
  - those days show red on the calendar with the reason, and the ranker never offers a slot on them

- hosted via cloudflare tunnel so i can access any time with password
