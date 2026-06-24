module.exports = {
    ROUTES: [
        // SHORT HAUL
        {
            id: 'EDDF-EDDM',
            type: 'Short Haul',
            departure: 'EDDF',
            arrival: 'EDDM',
            distance: 161,
            time: '00:45',
            routing: 'EDDF/07C TOBAK4E TOBAK Y161 SULUS SULUS2A EDDM/08L',
            callsigns: ['DLH114', 'DLH102', 'DLH106']
        },
        {
            id: 'EDDM-EDDF',
            type: 'Short Haul',
            departure: 'EDDM',
            arrival: 'EDDF',
            distance: 161,
            time: '00:45',
            routing: 'EDDM/08L GIVMI6Q GIVMI Y101 ERNAS T161 DEBHI DEBHI1C EDDF/07L',
            callsigns: ['DLH115', 'DLH103', 'DLH107']
        },
        {
            id: 'EDDF-EDDW',
            type: 'Short Haul',
            departure: 'EDDF',
            arrival: 'EDDW',
            distance: 181,
            time: '00:50',
            routing: 'EDDF/07C MARUN5E MARUN Z100 WRB T152 NIE NIE2A EDDW/09',
            callsigns: ['DLH352', 'DLH356', 'DLH360']
        },
        {
            id: 'EDDW-EDDF',
            type: 'Short Haul',
            departure: 'EDDW',
            arrival: 'EDDF',
            distance: 181,
            time: '00:50',
            routing: 'EDDW/09 WSR2F WSR Z101 PIMOS T150 ROLIS ROLIS2A EDDF/07L',
            callsigns: ['DLH353', 'DLH357', 'DLH361']
        },
        {
            id: 'EDDM-EDDW',
            type: 'Short Haul',
            departure: 'EDDM',
            arrival: 'EDDW',
            distance: 310,
            time: '01:05',
            routing: 'EDDM/08L INROG5Q INROG Y102 ERETO Z101 PIMOS T152 NIE NIE2A EDDW/09',
            callsigns: ['DLH2112', 'DLH2114']
        },
        {
            id: 'EDDW-EDDM',
            type: 'Short Haul',
            departure: 'EDDW',
            arrival: 'EDDM',
            distance: 310,
            time: '01:05',
            routing: 'EDDW/09 WSR2F WSR Y101 ERNAS T161 DEBHI DEBHI2A EDDM/08L',
            callsigns: ['DLH2113', 'DLH2115']
        },
        {
            id: 'EDDF-LFPG',
            type: 'Short Haul',
            departure: 'EDDF',
            arrival: 'LFPG',
            distance: 250,
            time: '01:00',
            routing: 'EDDF/07C SOBRA6E SOBRA Y180 REMIQ UT10 MEDAL MEDAL9A LFPG/08R',
            callsigns: ['DLH1034', 'DLH1036', 'DLH1040']
        },
        {
            id: 'EDDM-LIRF',
            type: 'Short Haul',
            departure: 'EDDM',
            arrival: 'LIRF',
            distance: 380,
            time: '01:15',
            routing: 'EDDM/08L KPT6Q KPT L856 BRENO M726 BZO M984 ELB ELB2A LIRF/16R',
            callsigns: ['DLH1868', 'DLH1870']
        },

        // MEDIUM HAUL
        {
            id: 'EDDF-LGAV',
            type: 'Medium Haul',
            departure: 'EDDF',
            arrival: 'LGAV',
            distance: 970,
            time: '02:30',
            routing: 'EDDF/07C CINDY5E CINDY Y163 RAPET L856 LNZ M141 SPL UP91 TRL UM603 TSL TSL1A LGAV/03R',
            callsigns: ['DLH1278', 'DLH1282']
        },
        {
            id: 'EDDM-LGAV',
            type: 'Medium Haul',
            departure: 'EDDM',
            arrival: 'LGAV',
            distance: 810,
            time: '02:10',
            routing: 'EDDM/08L MINKA5Q MINKA L856 LNZ M141 SPL UP91 TRL UM603 TSL TSL1A LGAV/03R',
            callsigns: ['DLH1752', 'DLH1754']
        },
        {
            id: 'EDDM-EGLL',
            type: 'Medium Haul',
            departure: 'EDDM',
            arrival: 'EGLL',
            distance: 510,
            time: '01:45',
            routing: 'EDDM/08L GIVMI6Q GIVMI Y101 ERNAS L603 TEBRO T121 LOGAN LOGAN2H EGLL/27R',
            callsigns: ['DLH2474', 'DLH2478']
        },
        {
            id: 'EDDF-LEPA',
            type: 'Medium Haul',
            departure: 'EDDF',
            arrival: 'LEPA',
            distance: 680,
            time: '02:00',
            routing: 'EDDF/07C SOBRA6E SOBRA Y180 REMIQ UT10 MEDAL UN857 DIRMO UN869 LERGA LERGA2A LEPA/24L',
            callsigns: ['DLH1158', 'DLH1160']
        },

        // HEAVY & LONG HAUL
        {
            id: 'EDDF-RJTT',
            type: 'Long Haul',
            departure: 'EDDF',
            arrival: 'RJTT',
            distance: 5000,
            time: '11:15',
            routing: 'EDDF/07C MARUN5E MARUN Z100 WRB UN858 TUS N872 ELSIR G3 MAG G436 KUT G490 UUN R22 ALUTI ALUTI2A RJTT/34L',
            callsigns: ['DLH716']
        },
        {
            id: 'EDDF-EGLL',
            type: 'Long Haul',
            departure: 'EDDF',
            arrival: 'EGLL',
            distance: 340,
            time: '01:25',
            routing: 'EDDF/07C SOBRA6E SOBRA Y180 REMIQ L603 TEBRO T121 LOGAN LOGAN2H EGLL/27R',
            callsigns: ['DLH900', 'DLH904']
        },
        {
            id: 'EDDM-LEPA',
            type: 'Long Haul',
            departure: 'EDDM',
            arrival: 'LEPA',
            distance: 660,
            time: '02:00',
            routing: 'EDDM/08L KPT6Q KPT L856 BRENO M726 BZO M984 ELB UN853 MAXON MAXON2A LEPA/24L',
            callsigns: ['DLH1816', 'DLH1818']
        },

        // CARGO
        {
            id: 'EDDF-EGLL-C',
            type: 'Cargo',
            departure: 'EDDF',
            arrival: 'EGLL',
            distance: 340,
            time: '01:25',
            routing: 'EDDF/07C SOBRA6E SOBRA Y180 REMIQ L603 TEBRO T121 LOGAN LOGAN2H EGLL/27R',
            callsigns: ['GEC8280', 'GEC8282']
        },
        {
            id: 'EDDF-RJTT-C',
            type: 'Cargo',
            departure: 'EDDF',
            arrival: 'RJTT',
            distance: 5000,
            time: '11:15',
            routing: 'EDDF/07C MARUN5E MARUN Z100 WRB UN858 TUS N872 ELSIR G3 MAG G436 KUT G490 UUN R22 ALUTI ALUTI2A RJTT/34L',
            callsigns: ['GEC8392']
        },
        {
            id: 'EDDM-RJTT-C',
            type: 'Cargo',
            departure: 'EDDM',
            arrival: 'RJTT',
            distance: 5100,
            time: '11:30',
            routing: 'EDDM/08L INROG5Q INROG Y102 ERETO UN858 TUS N872 ELSIR G3 MAG G436 KUT G490 UUN R22 ALUTI ALUTI2A RJTT/34L',
            callsigns: ['GEC8394']
        },
        {
            id: 'EDDF-LIRF-C',
            type: 'Cargo',
            departure: 'EDDF',
            arrival: 'LIRF',
            distance: 520,
            time: '01:30',
            routing: 'EDDF/07C CINDY5E CINDY Y163 RAPET L856 BRENO M726 BZO M984 ELB ELB2A LIRF/16R',
            callsigns: ['GEC8120']
        },
        {
            id: 'EDDM-LIRF-C',
            type: 'Cargo',
            departure: 'EDDM',
            arrival: 'LIRF',
            distance: 380,
            time: '01:15',
            routing: 'EDDM/08L KPT6Q KPT L856 BRENO M726 BZO M984 ELB ELB2A LIRF/16R',
            callsigns: ['GEC8122']
        },
        {
            id: 'EDDF-LGAV-C',
            type: 'Cargo',
            departure: 'EDDF',
            arrival: 'LGAV',
            distance: 970,
            time: '02:30',
            routing: 'EDDF/07C CINDY5E CINDY Y163 RAPET L856 LNZ M141 SPL UP91 TRL UM603 TSL TSL1A LGAV/03R',
            callsigns: ['GEC8140']
        },
        {
            id: 'EDDM-LGAV-C',
            type: 'Cargo',
            departure: 'EDDM',
            arrival: 'LGAV',
            distance: 810,
            time: '02:10',
            routing: 'EDDM/08L MINKA5Q MINKA L856 LNZ M141 SPL UP91 TRL UM603 TSL TSL1A LGAV/03R',
            callsigns: ['GEC8142']
        }
    ]
};
