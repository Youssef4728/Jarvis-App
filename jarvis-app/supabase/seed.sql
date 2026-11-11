-- Schule (Stundenplan, Kürzel wie in der Stundenplan-App)
insert into routines (title, category, weekdays, time, end_time) values
 ('DEE24A · C210 · BT','schule','{1}','07:50','09:20'),
 ('DEE24A · C210 · BT','schule','{1}','09:40','11:10'),
 ('GEG24B · C208 · PK','schule','{1}','11:30','13:00'),
 ('SPG24B Sport · BI','schule','{1}','15:00','16:30'),
 ('BRCE2… · C208 · PK','schule','{2}','07:50','09:20'),
 ('ENE… · C209 · DE','schule','{2}','09:40','11:10'),
 ('BIFG2… · B104 · HM','schule','{2}','11:30','13:00'),
 ('MAG2… · C210 · KD','schule','{2}','13:15','14:45'),
 ('MAG2… · C209 · KD','schule','{3}','07:50','09:20'),
 ('BRCE2… · C208 · PK','schule','{3}','09:40','11:10'),
 ('VWG2… · C208 · WI','schule','{3}','11:30','13:00'),
 ('ENE24B · C209 · MF','schule','{3}','13:15','14:45'),
 ('ENE24A · C209 · DE','schule','{4}','07:50','09:20'),
 ('PGW2… · C208 · PK','schule','{4}','09:40','11:10'),
 ('BIFG2… · B106 · HM','schule','{5}','07:50','09:20'),
 ('PHG24 · A011 · KD','schule','{5}','09:40','11:10'),
 ('DEE24A · C210 · BT','schule','{5}','11:30','13:00');

-- Gym: Push, Pull, Legs, Brust/Rücken, Arme, Sa+So frei (ca. 1 Std., Uhrzeit später setzen)
insert into routines (title, category, weekdays, notes) values
 ('Gym: Push','gym','{1}','ca. 1 Std.'),
 ('Gym: Pull','gym','{2}','ca. 1 Std.'),
 ('Gym: Legs','gym','{3}','ca. 1 Std.'),
 ('Gym: Brust/Rücken','gym','{4}','ca. 1 Std.'),
 ('Gym: Arme','gym','{5}','ca. 1 Std.');

insert into breaks (title, start_date, end_date, categories) values
 ('Herbstferien','2026-10-12','2026-10-24','{schule}'),
 ('Parisfahrt','2026-10-25','2026-10-30','{schule,fussball,gym}');

insert into events (title, day, time, category, notes, skipped) values
 ('Geburtstag / Feier','2026-10-10',null,'privat',null,false),
 ('Spiel Herren: TuS Westerende (auswärts)','2026-10-11','15:00','fussball','Zusage offen',true),
 ('Training A-Junioren','2026-10-12','18:45','fussball','Beginn 19:00',true),
 ('EKG in Aurich','2026-10-12','15:00','termin',null,false),
 ('Beratungstermin Bundeswehr','2026-10-13','14:00','termin',null,false),
 ('Training A-Junioren','2026-10-14','17:45','fussball','Beginn 18:00',true),
 ('Training Herren','2026-10-14','18:45','fussball','Beginn 19:00',true),
 ('Heimspiel Herren: VfB Münkeboe','2026-10-16','19:30','fussball',null,false),
 ('Training A-Junioren','2026-10-19','18:45','fussball','Beginn 19:00',false),
 ('Training Herren','2026-10-20','18:45','fussball','Beginn 19:00',false),
 ('Training A-Junioren','2026-10-21','17:45','fussball','Beginn 18:00',false),
 ('Training Herren','2026-10-22','18:45','fussball','Beginn 19:00',false),
 ('Auswärtsspiel A-Junioren: JFV Delmenhorst','2026-10-24','13:00','fussball',null,false),
 ('Parisfahrt Start','2026-10-25',null,'reise',null,false),
 ('Parisfahrt Rückkehr','2026-10-30',null,'reise',null,false);
