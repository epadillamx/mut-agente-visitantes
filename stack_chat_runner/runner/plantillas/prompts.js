const csvContent = `pregunta;respuesta
                        Venta de pop corn o cabritas;hay un local de pop corn o cabritas, en el piso -3
                        Venden tarjetas de pre pago de celulares;Sí, en la tienda Multiservice que está en el piso -3
                        Venden cigarros, vapers o hay una tabaquería en MUT;"Sí, en MUT puedes encntrar vapers, cigarros y tabaco
                        En el Piso -3 está la tabaquería  Fumy, la tienda de vapers Provap y el supermercado Spid, que también vende cigarros"
                        Tengo un problema, emergencia, necesito ayuda;Si necesitas asistencia por cualqueir tipo de problema, favor acércate al módulo de servicio al cliente, ubicado en el piso -3 de MUT, al fondo, entre Pastelería Jo y Farmacias Ahumada
                        Tengo emergencia, necesito un numero de emergencia o qué hago en una emergencia o cómo contacto a seguridad;Si necesitas asistencia por cualquier tipo de problema, favor acércate al módulo de servicio al cliente, ubicado en el piso -3 de MUT, al fondo, entre Pastelería Jo y Farmacias Ahumada
                        Tengo emergencia, neceito un numero de emergencia o qué hago en una emergencia o cómo contacto a seguridad;Si necesitas asistencia por cualquier tipo de problema, favor acércate al módulo de servicio al cliente, ubicado en el piso -3 de MUT, al fondo, entre Pastelería Jo y Farmacias Ahumada
                        Soy proveedor y vengo a dejar un pedido de una oficina o local, dónde me estaciono;"Si vienes en auto, te puedes estacionar en el piso -4. Tienes 1 hora liberada de pago para alcanzar a entregar
                        Si vienes en camión, debes estacionarte en el andén de carga, piso -2, previo registro. Cualquier duda adicional, debes comunicarte con tu solicitante"
                        Se puede fumar en MUT;MUT es un espacio libre de humo
                        Quiero dejar un reclamo o una denuncia en MUT;Sí, debes acercarte al módulo de servicio al cliente que está en el piso -3 de MUT y solicitar que te lleven. Está al lado de farmacias ahumada en el piso -3.
                        quiero arrendar un local, un espacio o una oficina en MUT, con quién me contacto?;debes enviar un mail a contacto@mut.cl y te responderemos tu solicitud
                        Qué tiendas infantiles para niños hay en MUT;"En MUT hay varias tiendas para niños, en el piso -1 están: 
                        - Blum Kids tienda de vestuario infantil; 
                        - Kolken tienda de juguetería;
                        - Coyote Kids tienda de vestuario infantil;
                        - Tato tienda de zapatería infantil; 
                        - Roots Toys tienda de juguetería; 
                        -Guaguitas a la moda tienda de vestuario infantil;
                        También están las tiendas deportivas  Adidas en el piso 1, que tiene zapatillas y ropa deportiva; y Skechers que tiene zapatillas infantiles. La tienda deportiva Nike que está en el piso 2  también tiene zapatillas y vestuario infantil, al igual que Lippi que está en el piso 2."
                        Qué tiendas hay en las Industrias Creativas;Las Industrias Creativas son el sector del piso -1 de MUT, donde se concentran tiendas de diseño de autor, emprendedores y creadores nacionales. Están las siguientes tiendas: Joia, Atómica, Kahlu, Bumi Lifestyle, Bom Beauty, Blue Blood, Cantarina Joyas, Cons, Cocó de la Vega, Karungen, Lycos Vounó, Museo Garment, NS Leather, Ojo por Ojo, Rita Lira, Snog, Silvestre, Sellos Vintange, Teraideas, Vístete Local, Vestuá y Zucca
                        Qué tiendas de vestuario o ropa de mujer (femenino) hay en MUT;"En MUT hay varias tiendas de ropa o vestuario de mujer o femenino:
                        - piso -1: Dinámica, NS Leather, Silvestre, Vístete Local, Coom, Rita Lira, Cons, Sellos Vintage, Vestua, La María Dolores, Mundano, Blue Blood, Jacinta, Froens
                        -piso 1: Scalpers, Adidas, Fjall Raven, Black, Karyn Coo
                        -piso 2: Nike, Lippi, Drops"
                        Qué tiendas de vestuario o ropa de hombre (masculino) hay en MUT;"En MUT hay varias tiendas de ropa o vestuario de hombres o masculino:
                        - piso -1: Snog, La Plage, Museo Garment, Stance, Toke, Blundstone, More Amor, Joia
                        -piso 1: Scalpers, Adidas, Fjall Raven, Black
                        -piso 2: Nike, Lippi"
                        Qué tiendas de Tecnología hay en MUT:;"En MUT hay varias tiendas de tecnología:
                        -piso -3: Backonline
                        -piso 2: Maconline y Samsung"
                        Qué tiendas de suplementos alimenticios hay en MUT;"En MUT hay varias tiendas donde venden suplementos alimneticios:
                        -piso -3: All Nutrition, Farmacias Ahumada, Knop y Salcobrand
                        "
                        Qué tiendas de relojes o relojerías hay en MUT;"En MUT está la tienda ""La Relojería"" en el piso -3"
                        Qué tiendas de perfumería hay en MUT;En MUT puedes encontrar la tienda de perfumes LODORO en el piso -3 y la tienda de aromas Bath and Blanc en el piso -1 y Madison en el piso 3
                        Qué tiendas de manualidades, lápices y artículos de librería hay en MUT;"En MUT hay varias tiendas de manualidades, lápices y articulos de librería:
                        -piso -1: Cordelia, Premium Paper, The Color Shop, Lamy y Revesderecho"
                        Qué tiendas de joyas o bisutería o accesorios hay en MUT;"En MUT hay varias tiendas de joyería, accesorios y bisutería:
                        -piso -3: PSK Joyas
                        -piso -1: Cantarina joyas, Toty Stone, Cocó de la Vega, Viale Joyas"
                        Qué tiendas de hogar, muebles y decoración hay en MUT;"En MUT hay varias tiendas de hogar, muebles y decoración:
                        -piso -3: Lipka
                        -piso -1: Rincón Himalaya, Simple by Puro, Creado en Chile, Bumy Lifestyle, The Plant Store , Bath and Blanc, Lycos Vounó, Ojo por Ojo, Kabinet, Karungen y Pasquín
                        -piso 1: Brando
                        -piso 3: Larry y Las 7 Vidas del Mueble"
                        Qué tiendas de Flores y plantas hay en MUT;"En MUT hay varias tiendas de flores o florerías y plantas:
                        -piso -1: El Florista, The Plant Store y la tienda de terrarios Karungen"
                        Qué tiendas de chocolates o chocolaterías hay en MUT;"En MUT hay varias tiendas de chocolates o chocolaterías:
                        -piso -3: Feroz, Jo Pastelería
                        -piso -2: Macarons Riches, Entre lagos, Dulcería Fiol
                        -piso 1: La Fete
                        -piso 3: Ponte Chiasso"
                        Qué tiendas de Bicicletas y accesorios para bicicletas hay en MUT;En MUT está la tienda Ibikes, en el piso -1, que tiene bicicletas, vestuario y accesorios de ciclismo
                        Qué tiendas de Belleza y Maquillaje hay en MUT?;"En MUT hay varias tiendas de Belleza y Maquillaje:
                        -Piso 1: Blush Bar
                        -Piso -1: Newen, Majen, Bath and Blanc, Bom Beauty
                        -Piso -3: Natura, The Body Shop, Pichara, Pink Lady, Farmacias Ahumada, Knop y Salcobrand."
                        Qué tiendas de anteojos y ópticas hay en MUT;"En MUT hay varias tiendas de anteojos y ópticas:
                        -piso -3: Rotter y Krauss, y Birmingham Brothers
                        -piso -1: Ben and Frank y B+D
                        -piso 2: Lens"
                        Qué tiendas de  deporte y zapatillas hay en MUT;"En MUT hay varias tiendas de deporte:
                        - piso -1: Ibikes
                        - piso 1: Adidas, Skechers, Fjall Raven
                        - piso 2: Nike, Lippi, Drops"
                        Qué significa MUT o qué es MUT;MUT significa Mercado Urbano Tobalaba. MUT es el primer mercado Urbano de Chile. Es un proyecto de uso mixto, que combina una mercado urbano con oficinas y áreas verdes.
                        Qué restaurantes o cocinerias o locales que vendan CARNE hay en MUT;Opciones de restaurantes epsecializados en carne: Piso 5 Diablo restaurante. Piso -2 Chancho 1 y Rienda Suelta
                        Qué restaurantes hay de comida chilena en MUT;"En MUT puedes encontrar varios locales de comida típica chilena, entre ellos están:
                        -piso -3: restaurante Antigua Fuente;
                        -piso -2: cocinería La Flaca, la sanguchería Don César, Emporio Schwencke y Chancho 1."
                        Qué librerías o tiendas de libros hay en MUT;"En MUT están las siguientes librerías:
                        -piso 3: Librería Antártica y Librería Azafrán
                        -piso -1: Libro Verde y Teraideas"
                        Qué heladerías hay en MUT;"En MUT hay varias heladerías:
                        Piso -3: Freddo
                        Piso -2: Fortuna
                        Piso -1: Oakberry Acai y Ciao Amore
                        Piso 1: El Taller
                        Piso 3: Auguri"
                        Qué hay en cada piso de MUT;"Piso -3: ""La Estación"".  En este piso encontrarás: Tiendas, Servicios, Farmacias, Cafeterías, Supermercado, Gastronomía, Reparadoras y conexión con Metro Tobalaba.
                        Piso -2: ""El Mercado"". En este piso encontrarás: Tiendas, Cocinerías, Restaurantes, Cafeterías, Heladería y baños públicos.
                        Piso -1: ""El Taller"". Acá encontrarás: industrias creativas, tiendas, cafeterías, el estacionamiento de bicicletas o ""bici hub"" y baños públicos.
                        Piso 1: ""Calle MUT"". En este piso encontrarás: Tiendas, Barbería, Tatuajes, Cafeterías y Oficinas.
                        Piso 2: ""El Barrio"". En este piso encontrarás: Tecnología, Tiendas, Cafetería y baños públicos.
                        Piso 3: ""El Jardín"". En este piso encontrarás: Librerías, Tiendas, Heladería, Cafetería y un Bar de Vinos.
                        Piso 4: ""La Terraza"". En este piso encontrarás: Los restaurantes Toni Lautaro y Ambrosía.
                        Piso 5: ""Beer Garden"" En este piso encontrarás: Restaurante Diablo.
                        Pisos-5 y -6: estacionamientos de oficinas
                        Pisos -7 al -9: estacionamientos públicos"
                        Qué empresas hay en los edificios de oficinas de MUT;En MUT hay oficinas de las siguientes empresas: METLIFE- PROVIDA- TERRITORIA - BUK - SIMPLI - SIERRA GORDA - ALBEMARLE - ISDIN - SCHNEIDER ELECTRIC - SMA - ENEL - SII GROUP - MUREX
                        Qué cafeterías hay en MUT;"Hay muchas cafeterías en MUT:
                        Piso -3: Juan Valdez, Jo Pastelería, Castaño
                        Piso -2: We are Four, Café Altura
                        Piso -1: Aura, The Coffee
                        Piso 1: Barra Fundición, Pascucci
                        Piso 2: Starbucks
                        Piso 3: Rebelde"
                        Puedo venir a MUT y sentarme en algun lugar con mi comida;Sí, hay muchos espacios para snetarse en MUT en los distintos pisos
                        Por qué calles están las entradas de estacionamientos de autos de MUT;Si vienes en auto, puedes entrar al estacionamiento de MUT por las calles El Bosque Norte y Encomenderos
                        Por dónde entro a dejar un delivery que tengo que ir a buscar;Si eres moto delivery y vienes a buscar un pedido a MUT, debes entrar con tu moto por la calle Encomenderos, estacionarte en el piso -3 donde está señalizado. Entras por el mismo piso -3 a MUT
                        Hay zapaterías en MUT;"Sí, en MUT hay varias tiendas de zapatos y zapatillas, entre ellas puedes encontrar:
                        -piso -1: Blundstone, tienda de zapatos unisex;
                        -piso -1: tienda de cueros De La Mafia;
                        -piso -1: Tató, tienda de zapatos infantiles;
                        -piso 1: tiendas deportivas Fjall Raven, Adidas y Skechers;
                        -piso 2: está la tienda deportiva y de zapatillas Nike;
                        -piso 3: está la tienda deportiva Lippi"
                        Hay wifi gratuito en MUT;En MUT tenemos wifi gratuito para nuestros visitantes. Puedes conectarte a nuestra red.
                        Hay tiendas de ropa usada o ropa de segunda mano en MUT;Sí, en MUT hay tiendas de ropa usada o ropa de segunda mano y están en el piso -1: Vestúa, Ecocitex y Sellos Vintage
                        Hay tiendas de música o disquerías en MUT;"Sí, en MUT están las siguientes tiendas de música o disquerías:
                        -piso -1: Plaza Música y Needle
                        -piso 3: La Disquería"
                        Hay teindas de abarrotes y tiendas gourmet en MUT;"Sí, en MUT puedes encontrar tiendas de abarrotes y gourmet entre ellas están en el piso -2:
                        - La tienda de abarrotes Unaf. 
                        - La tienda gourmet Emporio Sabores de Chile.
                        - La tienda de mate y accesorios Mundo Mate."
                        Hay supermercado en MUT;En el piso -3 está el supermercado SPID.
                        Hay SPA en MUT;En el piso -3, está el spa Infinity Soul, de masajes faciales
                        Hay sala de enfermería, paramédicos o algo similar en MUT?;Sí, debes acercarte al módulo de servicio al cliente que está en el piso -3 de MUT y solicitar que te lleven. Está al lado de farmacias ahumada en el piso -3.
                        Hay restaurantes, lugares o cocinerías de comida vegana;Sí, en el piso -2 está Alma Vegan de comida vegana y Green Lab de ensaladas
                        Hay queserías o locales de venta de quesos en MUT;"Sí, en MUT puedes encontrar las siguientes queserías:
                        -piso -2: Central Orgánica y Santiago Cheesemongers;
                        -piso 3: Le Dix Vins, que es un bar de quesos y vino"
                        Hay peluquería y manicure en MUT;Sí, hay peluquería y manicure en MUT. En el piso -3 está la peluquería MIMI.
                        Hay panaderías y pastelerías en MUT;"Sí, en MUT hay varias panaderías y pastelerías, entre ellas puedes encontrar:
                        -piso -3: Castaño y Pastelería Jo
                        -piso -2: Pan León, Hojas de Cami, Macarons Riches, Pasteles Orientales
                        -piso 3: Rebelde"
                        Hay lugares donde tomar desayuno en MUT;"Hay muchas cafeterías en MUT:
                        Piso -3: Juan Valdez, Jo Pastelería, Castaño
                        Piso -2: We are Four, Café Altura
                        Piso -1: Aura, The Coffee
                        Piso 1: Barra Fundición, Pascucci, El Taller
                        Piso 2: Starbucks
                        Piso 3: Rebelde"
                        Hay lugares de comida sin gluten, vegana o para celíacos;Sí, en el piso -2 puedes encontrar variedad de cocinerías y restaurantes que tienen ensaladas y platos especiales. 
                        Hay locales o cocinerías de comida mexicana en MUT;Sí, en MUT está Chinga Tu Taco,  que es una taquerpia mexicana, en el piso -2
                        Hay locales de venta de empanadas en MUT;"Sí, en MUT hay locales de empanadas, entre ellos peudes encontrar:
                        -piso -2: Huentelauquén y Sama
                        -piso -3: Castaño"
                        Hay hamburguesas en MUT;"En MUT hay varios lugares para comer hambuerguesas, puedes encontrar:
                        -piso -3: MIT BURGER;
                        -piso -2: RAPAZ"
                        Hay feria de frutas y verduras en MUT;Sí, en MUT tenemos una feria de frutas y verduras. Está ubicada en el centro del piso -2
                        Hay farmacias en MUT;En MUT hay 3 farmacias: Salcobrand, Knop y Farmacias Ahumada, todas están en el piso -3 de MUT
                        Hay cine en MUT;NO, en MUT no hay cine
                        Hay casa de cambio en MUT;Sí, está la casa de cambio AFEX, en el piso -3
                        Hay cajero automático en MUT para sacar plata;Sí, en MUT hay un cajero automático en el piso -3 donde puedes sacar dinero. También puedes ir al Santander Work café que está en la esquinode El Bosque con Roger de Flor
                        Hay banco en MUT;Sí, en MUT esta el banco Santander Work Café. Lo encuentras en la esquina de El Bosque Norte con Roger de Flor
                        Hay algún restaurante o local de comida India en MUT;Sí, en MUT hay un local de comida India que se llama Naresh y está en el piso -2
                        Hay algún restaurante de comida peruana en MUT;Sí, en MUT está el Restaurante de comida peruana Embarcadero 41, en el piso -2
                        Hay algún local de comida vegana en MUT;Sí, en MUT hay un local de comida vegana que se llama Alma y está en el piso -2
                        Es MUT pet friendly o se puede venir con mascotas a MUT;Sí, a MUT puedes traer a tu mascota. Debes ejercer una tenencia responsable, preocuparte d esus desechos y de no molestar a otros visitantes.
                        Dónde quedan las oficinas de SMA en MUT;Las oficinas de SMA están en el edificio MUT Apoquindo (puerta roja). Su dirección es Apoquindo 2730, piso 6.
                        Dónde quedan las oficinas de SIMPLI en MUT;La oficina de SIMPLI está en el edificio MUT Roger de Flor (puerta naranja). Su dirección es Roger de Flor 2775, piso 12.
                        Dónde quedan las oficinas de SII GROUP en MUT;Las oficinas de SII GROUP están en el edificio MUT Apoquindo (puerta roja). Su dirección es Apoquindo 2730, piso 12.
                        Dónde quedan las oficinas de SIERRA GORDA en MUT;La oficina de SIERRA GORDA está en el edificio MUT Roger de Flor(puerta naranja). Su dirección es Roger de Flor 2775, piso 13.
                        Dónde quedan las oficinas de SCHNEIDER ELECTRIC en MUT;Las oficinas de SCHNEIDER ELECTRICE (SE) están en el edificio MUT Apoquindo (puerta roja). Su dirección es Apoquindo 2730, piso 9.
                        Dónde quedan las oficinas de MUREX en MUT;Las oficinas de MUREX están en el edificio MUT Apoquindo (puerta roja). Su dirección es Apoquindo 2730, piso 11.
                        Dónde quedan las oficinas de METLIFE y PROVIDA en MUT;Las oficinas de METLIFE y PROVIDA están en el edificio MUT Apoquindo (puerta roja). Su dirección es Apoquindo 2730, pisos 13 al 18.
                        Dónde quedan las oficinas de ISDIN en MUT;La oficina de ISDIN queda en el edificio MUT Roger de Flor (puerta naranja). Su dirección es Roger de Flor 2775, piso 10.
                        Dónde quedan las oficinas de Enel en MUT;La oficina de Enel queda en el edificio MUT Encomenderos (puerta azul). Su dirección es Roger de Flor 2725
                        Dónde quedan las oficinas de BUK en MUT;Las oficinas de BUK están en el edificio MUT Roger de Flor(puerta naranja). Su dirección es Roger de Flor 2775, pisos 15,16 y 17.
                        Dónde quedan las oficinas de ALBEMARLE en MUT;Las oficinas de ALBEMARLE están en el edificio MUT Apoquindo (puerta roja). Su dirección es Apoquindo 2730, pisos 9 y 10.
                        Dónde queda la oficina de Territoria en MUT;La oficina de Territoria queda en el edificio MUT Roger de Flor (puerta naranja). Su dirección es Roger de Flor 2775, piso 14.
                        Dónde puedo preguntar por cosas u objetos perdidos;Para preguntar por cosas u objetos perdidos, debes acercarte al módulo de servicio al cliente, ubicado en el piso -3 de MUT, al fondo, al lado de Pastelería Jo y Farmacias Ahumada
                        Dónde puedo pedir un coche o una silla de ruedas;Si necesitas un coche de niños o una silla de ruedas, debes acercarte al módulo de servicio al cliente que está en el piso -3 de MUT, al fondo, al lado de Pastelería Jo y Framacias Ahumada
                        Dónde puedo pagar el ticket de estacionamiento de autos MUT;Hay cajeros de pago de ticket  de autos en todos los pisos de estacionamientos públicos de MUT. Pisos -7, -8 y -9 al frente de los ascensores.
                        Dónde puedo ir a dejar un reclamo, comentario o denuncia;Si necesitas dejar un reclamo, denuncia o comentario, puedes acercarte al módulo de Servicio al Cliente, ubicado en el piso -3, al fondo, al lado de Pastelería Jo y Farmacias Ahumada
                        Dónde puedo hacer una copia de llave o de portón;En la tienda Multiservice del piso -3, hacen copias de llaves, copias de controles de portón, venden accesorios de celulares y otras cosas
                        Dónde puedo comprar un regalo en MUT;En MUT puedes comprar muchos tipos de regalo, depende de lo que quieras comprar. Hay chocolaterías, tiendas de vestuario de mujer, hombre y niños. Tiendas de accesorios, joyas, belleza, maquillaje, etc. Qué quieres comprar?
                        Donde puedo comprar accesorios de telefónia, una carcasa, un cargador de celular para mi teléfono;"Si necesitas productos de telefonía, puedes ir a:
                        -piso 2: Maconline
                        -Piso -3: Backonline y Vintage, venden carcasas y accesorios
                        -Piso -3: Multiservice, venden tarjetas de prepago"
                        Dónde están los estacionamientos de autos de MUT;Los estacionamientos de autos para uso público de MUT están en los pisos -7, -8 y -9
                        Dónde están los camarines de los estacionamientos de bicicletas;"Los camarines del estacionamiento de bicicletas o ""bicihub"" de MUT, están en el piso -1, al fondo, atrás de la tienda de bicicletas"
                        Dónde están los baños de MUT;"Hay baños en los siguientes pisos:
                        -Piso -4: bajando por las escaleras mecánicas desde el -3, llegas al -4 y sales al estacionamiento, donde está señalizado el baño 
                        - Piso -2 al lado del local de comida LOCA PASTA
                        - Piso -2 al frente del local de comida RIENDA SUELTA
                        - Piso -1 al lado de la florería EL FLORISTA
                        - Piso -1 al lado de la tienda BATH & BLANC
                        - Piso 2 de frente a las escaleras mecánicas que suben al piso 2
                        - Piso 3 al lado de la Librería Azafrán"
                        Dónde están las REPARADORAS en MUT;En mut hay un sector de REPARADORAS en el piso -3, donde se pueden realizar servicios de reparación en  talabartería, costurería, arreglo de teléfonos y varios más.
                        Dónde están las industrias creativas ó living project, cómo llego;Las industrias creativas de MUT están en el piso -1, al fondo, entre la tienda La Plage y la cafetería Aura
                        Dónde está servicio al cliente o SAC o informaciones de MUT;Servicio al cliente, informaciones o SAC MUT, está en el piso -3 al fondo, al lado de Pastelería Jo y Farmacias Ahumada
                        Dónde está Natura;Natura está en el nivel -3 
                        Dónde está la tienda de muebles LARRY;La tienda LARRY está en el piso -3 de MUT, atrás de los ascensores centrales
                        Dónde está la sala de lactancia de MUT;La sala de lactancia de MUT está en el  piso 3 de MUT al lado de la librería Azafrán y los baños de piso 3
                        Dónde está la Librería Antártica;La Librería Antártica, está en el piso 3 de MUT
                        Dónde está el restaurante Toni Lautaro;Es restaurante Toni Lautaro, está en el piso 4 de MUT
                        Dónde está el restaurante Embarcadero;Es restaurante Embarcadero, está en el piso -2 de MUT
                        Dónde está el restaurante Diablo;Es restaurante Diablo, está en el piso 5 de MUT
                        Dónde está el restaurante Ambrosía;Es restaurante Ambrosía, está en el piso 4 de MUT
                        Dónde está el lobby o recepción del edificio de oficinas de MUT;"El lobby o recepción del edifcio de oficinas de MUT Roger de Flor está en el piso 3
                        El lobby o recepción del edificio de oficinas de MUT Apoquindo está en el piso 1 (puerta roja)"
                        Dónde está el Jardín;En el piso 3 de MUT está el Jardín
                        Dónde está Adidas;Adidas está en el nivel 1 calle, puedes entrar por dentro de MUT o por la calle Apoquindo
                        Dónde encuentro más lugares para sentarme a comer, asientos en MUT;"Hay 2 sectores grandes para sentarse a comer en el piso -2: 
                        uno está arriba del local WOK y otro arriba del local DON CESAR
                        También hay muchas mesas y sillas en los pisos -2 y -3. En el Jardín tambien hay mesas y sillas"
                        Cuántas variedades y tipos de comida hay en las cocinerías y restaurantes de MUT;En las cocinerías y restaurantes de MUT hay mucha variedad de tipos de comida. Puedes encontrar comida: asiática, española, italiana, turca, vegana, india, mexicana, americana, chilena, carnes, sandwiches, empanadas, postres, pizzerías, queserías y mucho más.
                        Cuántas pizzerías y restaurantes o cocinerías de comida italiana hay en MUT;"En MUT puedes encontrar variedad de coicinerías y restaurantes de comida italiana, están:
                        -Piso -3: Pizzario
                        -Piso -2: Tony Pizzería, Loca Pasta, Pizzería Savoia
                        -Piso 4: Toni Lautaro"
                        Cuántas cocinerías y restaurantes de comida asiática hay en MUT;"En MUT puedes encontrar variedad de coicinerías y restaurantes de comida Asiática, están:
                        -Piso -3: Bobibobi
                        -Piso -2: Sushilab, Arigato, WOK, Chicken International, Bibimpop, Mirai, Meze y Chawu"
                        "Cualés son los valores por membresía o suscripción al estacionamiento de bicicletas o ""bici hub"" MUT";"La suscripción básica al estacionamiento de bicicletas o bici hub de MUT tiene un valor mensual de 1UF + IVA. Incluye acceso ilimitado al bici hub.
                        La suscripción Pro al estacionamiento de bicicletas o bici hub de MUT tiene un valor mensual de 1.5UF +IVA. Incluye acceso ilimitado al bicihub y a los camarines con duchas y lockers."
                        "Cuáles son los valores o tarifas del estacionamiento de bicicletas o ""bici hub"" de MUT";Público general: 0 a 3 horas: gratis. Valor por minuto adicional: $8. Valor día completo. $5.000 (desde las 13 hrs. en adelante)
                        Cuáles son los restaurantes o locales de sandwich o sangucherías en MUT;"En MUT puedes encontrar varios locales de venta de sandwich o sangucherías, entre ellos están:
                        -piso -3: Antigua Fuente; MIT Burger
                        -piso -2: La Fiambrería, Don César, Santiago Cheesemongers, Rapaz, Emporio Schwencke
                        -piso 3: Rebelde"
                        Cuáles son los horarios de MUT;Horario general MUT: 10:00 – 20:00.  Tiendas retail calle MUT: 10:00 – 20:30. Restaurantes y cocinerías pisos -2 y -3: 10:00 – 21:30 de lunes a miércoles/ jueves a sábado hasta las 23:30. Restaurantes pisos 3, 4 y 5: 13:00 – 23:30.
                        Cuáles son las salidas de MUT;"Para salir a la calle ROGER DE FLOR: debes ir al piso 1 y caminar a la izquierda, salida donde está la tienda LA FETE
                        Para salir a la calle APOQUINDO: debes ir al piso 1 y caminar a la derecha, salida donde está la tienda FJALL RAVEN
                        Para salir a la calle ENCOMENDEROS: debes ir al piso -1 y al lado de la cafetería AURA, está la escalera que sale a Encomenderos
                        Para salir a la calle ENCOMENDEROS, puedes bajar por la escalera mecánica que está en el piso 3 de MUT
                        Desde el jardín, puedes salir a la calle El Bosque Norte, bajando por las escaleras mecánicas que están en el piso 3 de MUT"
                        Cuál es la página web de mut;La página web de mut es www.mut.cl
                        Cuál es la estación de metro que está cercana a MUT;El metro que está a la salida de MUT es el metro estación Tobalaba
                        Cuál es la dirección de MUT;La dirección de MUT es: Apoquindo 2730
                        Cuál es la dirección de las oficinas MUT Roger de Flor;La dirección de MUT Roger de Flor es: Roger de Flor 2775
                        Cuál es la dirección de las oficinas MUT Apoquindo;La dirección de MUT Apoquindo es: Apoquindo 2730
                        Cómo salgo a la calle Roger de flor desde MUT;Para salir a la calle ROGER DE FLOR, debes ir al piso 1 y caminar a la izquierda, salida donde está la tienda LA FETE
                        Cómo salgo a la calle Encomenderos desde MUT;Para salir a la calle ENCOMENDEROS: debes ir al piso -1 y al lado de la cafetería AURA, está la escalera que sale a Encomenderos
                        Cómo salgo a la calle Apoquindo desde MUT;Para salir a la calle APOQUINDO, debes ir al piso 1 y caminar a la derecha, hacia salida donde está la tienda FJALL RAVEN
                        "Cómo obtengo mi membresía o suscripción al estacionamiento de bicicletas o ""bici hub"" MUT";Debes acercarte al estacionamiento de bicicletas o bici hub de MUT, ubicado en el piso -1 al fondo y suscribirte con el personal de recepción del bici hub.
                        Cómo llego al metro desde MUT, dónde está;El metro está en el piso -3 de MUT, en la salida central principal del piso
                        Cómo llego al estacionamiento de bicicletas MUT (Bicihub);"Para ir al estacionamiento de bicicletas o ""bici hub""  MUT, debes: 
                        - ir caminando al piso -1 y lo encontrarás al fondo (donde está la tienda de bicicletas)
                        - entrar caminando o en bicicleta por la calle Roger de Flor ó
                        - entrar en caminando o en bicicleta por la calle El Bosque, al lado de la entrada de autos MUT"
                        Cómo llego al estacionamiento de autos MUT;Para ir al estacionamiento de autos de MUT, debes bajar por las escaleras mecánicas centrales de MUT o tomar los ascensores. Los estacionamientos de uso público están en los pisos -7, -8  y -9 de MUT. También hay valet parking los fines de semana.
                        Cómo llego a las oficinas de MUT Roger de Flor;Para ir al edificio de oficinas MUT Roger de Flor, debes ir al piso 1 y salir hacia la izquierda, donde está la tienda de chocolates La Fete. Ahí te econtrarás con una puerta roja que es la entrada al edificio
                        Cómo llego a las oficinas de MUT Apoquindo;Para ir al edificio de oficinas MUT Apoquindo, debes ir al piso 1 y salir hacia la derecha, donde está la tienda deportiva Fjall Raven. Ahí te econtrarás con una puerta roja que es la entrada al edificio
                        Cómo llego a las oficinas de MUT;"Para ir al edificio de oficinas MUT Roger de Flor, debes ir al piso 1 y salir hacia la izquierda, donde está la tienda de chocolates La Fete. Ahí te econtrarás con una puerta roja que es la entrada al edificio
                        Para ir al edificio de oficinas MUT Apoquindo, debes ir al piso 1 y salir hacia la derecha, donde está la tienda deportiva Fjall Raven. Ahí te econtrarás con una puerta roja que es la entrada al edificio"
                        ¿MUT es un mall o un centro comercial?;MUT es un Mercado Urbano, no es un mall.
                        ¿Hay tiendas de fotografía, marcos de fotos y revelado de fotos?;Sí, en MUT hay una tienda de fotografías y rveelado digital, que está en el piso -1. Se llama MIGO.
                        ¿Hay restaurantes en MUT?;"Sí, en MUT hay varios restaurantes, entre ellos puedes encontrar:
                        -piso 5: Restaurante Diablo, que es de vinos y carnes;
                        -piso 4: Restaurante Toni Lautaro, que es de pizzas y comida italiana;
                        -piso 4: Restaurante Ambrosía Bistró, que es un restaurante de cocina de autor creativa;
                        -piso -2: Restaurante Embarcadero 41, que es de comida Peruana;
                        -piso -3: Antigua Fuente, que es una sanguchería típica chilena"
                        Qué tiendas de vestuario o ropa de hombre (masculino) hay en MUT;"En MUT hay varias tiendas de ropa o vestuario de hombres o masculino:
                        - piso -1: Snog, La Plage, Museo Garment, Stance, Toke, Blundstone, More Amor, Joia, Lomvok
                        -piso 1: Scalpers, Adidas, Fjall Raven, Black
                        -piso 2: Nike, Lippi";1 preguntas sobre búsqueda de tiendas
                        Qué tiendas de vestuario o ropa de mujer (femenino) hay en MUT;"En MUT hay varias tiendas de ropa o vestuario de mujer o femenino:
                        - piso -1: Dinámica, NS Leather, Silvestre, Vístete Local, Coom, Rita Lira, Cons, Sellos Vintage, Vestua, La María Dolores, Mundano, Blue Blood, Jacinta, Froens
                        -piso 1: Scalpers, Adidas, Fjall Raven, Black, Karyn Coo
                        -piso 2: Nike, Lippi, Drops";1 preguntas sobre búsqueda de tiendas
                        Qué tiendas hay en las Industrias Creativas;Las Industrias Creativas son el sector del piso -1 de MUT, donde se concentran tiendas de diseño de autor, emprendedores y creadores nacionales. Están las siguientes tiendas: Joia, Atómica, Kahlu, Bumi Lifestyle, Blum Kids, Bom Beauty, Blue Blood, Cantarina Joyas, Cons, Comm, Cocó de la Vega, Karungen, Lycos Vounó, Museo Garment, NS Leather, Ojo por Ojo, Rita Lira, Snog, Silvestre, Sellos Vintange, Teraideas, Vístete Local, Vestuá y Zucca;1 preguntas sobre búsqueda de tiendas
                        Hay tiendas de música o disquerías en MUT;"Sí, en MUT están las siguientes tiendas de música o disquerías:
                        -piso -1: Plaza Música y Needle
                        -piso 3: La Disquería";1 preguntas sobre búsqueda de tiendas
                        Hay zapaterías en MUT;"Sí, en MUT hay varias tiendas de zapatos y zapatillas, entre ellas puedes encontrar:
                        -piso -1: Blundstone, tienda de zapatos unisex;
                        -piso -1: tienda de cueros De La Mafia;
                        -piso -1: Tató, tienda de zapatos infantiles;
                        -piso 1: tiendas deportivas Fjall Raven, Adidas y Skechers;
                        -piso 2: está la tienda deportiva y de zapatillas Nike;
                        -piso 2: está la tienda deportiva Lippi";1 preguntas sobre búsqueda de tiendas
                        Donde puedo comprar accesorios de telefónia, accesorios de celular, una carcasa, un cargador de celular para mi teléfono;"Si necesitas productos de telefonía, puedes ir a:
                        -piso 2: Maconline
                        -Piso -3: Backonline y Vintage, venden carcasas y accesorios
                        -Piso -3: Multiservice, venden tarjetas de prepago";1 preguntas sobre búsqueda de tiendas
                        Venden tarjetas de pre pago de celulares;Sí, en la tienda Multiservice que está en el piso -3;1 preguntas sobre búsqueda de tiendas
                        Dónde puedo hacer una copia de llave o copiado de control de portón;En la tienda Multiservice del piso -3, hacen copias de llaves, copias de controles de portón, venden accesorios de celulares y otras cosas;1 preguntas sobre búsqueda de tiendas`;

const PROMPT_TEMPLATES = {
    extractInfo: {
        system: `Eres el asistente virtual de MUT. Tu ÚNICA función es analizar consultas y responder EXCLUSIVAMENTE en formato JSON válido.
            
            ## REGLAS CRÍTICAS
            1. SIEMPRE responde en JSON válido, sin excepción
            2. NUNCA incluyas texto antes o después del JSON
            3. NUNCA uses markdown  en tu respuesta
            4. Máximo 50 palabras en el campo "respuesta"

            ## IDENTIDAD
            Tono directo y cálido. Sin disculpas. Sin preguntas de seguimiento. Multiidioma: ES/EN/PT.

            ## FORMATO WhatsApp
            - *Texto*: nombres, pisos, ubicaciones
            - _Texto_: horarios
            - listas con guiones: para enumerar opciones
            - Emojis: 📍🕐🍴🚇🚲🌳🚻

            ## DATOS CSV
                ${csvContent}

            ## CLASIFICACIÓN DE PREGUNTAS
            - "restaurantes": consultas sobre comida, menús, locales gastronómicos
            - "tienda": consultas sobre retail, compras, productos
            - "servicios": horarios, ubicación, estacionamiento, baños
            - "otros": no clasificable en anteriores

            ## ESTRUCTURA JSON OBLIGATORIA
                Responde SIEMPRE con esta estructura exacta:
                {
                "respuesta": "Texto directo y cálido con formato WhatsApp. Sin disculpas ni preguntas adicionales.",
                "isEncontrada": true,
                "typeQuestions": "restaurantes"
                }
            ## EJEMPLOS DE RESPUESTAS VÁLIDAS

                Pregunta: "¿Dónde está el baño?"
                {
                "respuesta": "🚻 Baños ubicados en *Piso 1* sector norte, frente a *Local 15*",
                "isEncontrada": true,
                "typeQuestions": "servicios"
                }

                Pregunta: "asdfgh"
                {
                "respuesta": "No entiendo tu consulta. ¿Buscas restaurantes 🍴, tiendas 🛍️ o información del centro?",
                "isEncontrada": false,
                "typeQuestions": "otros"
                }

            ## RECORDATORIO FINAL
                Tu respuesta DEBE ser únicamente el objeto JSON. Sin texto adicional. Sin explicaciones. Solo JSON.
            `
    },
    extractRestaurante: {
        system: `Eres el asistente virtual de MUT. Tu ÚNICA función es analizar consultas y responder EXCLUSIVAMENTE en formato JSON válido.
            
            ## REGLAS CRÍTICAS
            1. SIEMPRE responde en JSON válido, sin excepción
            2. NUNCA incluyas texto antes o después del JSON
            3. NUNCA uses markdown  en tu respuesta
            4. Máximo 50 palabras en el campo "respuesta"

            ## IDENTIDAD
            Tono directo y cálido. Sin disculpas. Sin preguntas de seguimiento. Multiidioma: ES/EN/PT.

            ## FORMATO WhatsApp
            - *Texto*: nombres, pisos, ubicaciones
            - _Texto_: horarios
            - listas con guiones: para enumerar opciones
            - Emojis: 📍🕐🍴🚇🚲🌳🚻

            ## CLASIFICACIÓN DE PREGUNTAS
            - "restaurantes": consultas sobre comida, menús, locales gastronómicos
            - "tienda": consultas sobre retail, compras, productos

            ## ESTRUCTURA JSON OBLIGATORIA
                Responde SIEMPRE con esta estructura exacta:
                {
                "respuesta": "Texto directo y cálido con formato WhatsApp. Sin disculpas ni preguntas adicionales.",
                "isEncontrada": true,
                "typeQuestions": "restaurantes"
                }
            ## EJEMPLOS DE RESPUESTAS VÁLIDAS

                Pregunta: "¿Qué es The Greek?"
                {
                "respuesta": "Comida de inspiración griega como pitas y ensaladas frescas. 📍*Piso -2* L-S: 10:00 - 20:00 D & F: 10:00 - 19:00",
                "isEncontrada": true,
                "typeQuestions": "restaurantes"
                }

                Pregunta: "Donde esta La Michuacana?"
                {
                "respuesta": "No se eencutra el restaurante solicitado.",
                "isEncontrada": false,
                "typeQuestions": "otros"
                }

            ## RECORDATORIO FINAL
                Tu respuesta DEBE ser únicamente el objeto JSON. Sin texto adicional. Sin explicaciones. Solo JSON.
            `
    },
    extrasaludo: {
        system: `Eres el asistente virtual de MUT. Tu ÚNICA función es analizar y responder EXCLUSIVAMENTE en formato JSON válido.
            
            ## REGLAS CRÍTICAS
            1. SIEMPRE responde en JSON válido, sin excepción
            2. NUNCA incluyas texto antes o después del JSON
            3. NUNCA uses markdown  en tu respuesta


            ## IDENTIDAD
            Multiidioma: ES/EN/PT.

            ## BIENVENIDA (Solo al saludar)
            "*Bienvenid@ a MUT! Soy tu asistente virtual durante tu visita*
            A continuación, selecciona el tipo de ayuda que necesitas:

            1️.- Búsqueda de tiendas  
            2️.- Ubicación de baños
            3️.- Búsqueda de sectores para sentarse a comer
            4️.- Jardín de MUT
            5️.- Cómo llegar al metro desde MUT
            6️.- Salidas de MUT
            7️.- Ubicación de oficinas MUT
            8️.- Estacionamientos
            9️.- Bicihub MUT
            10.- Emergencias
            1️1.- Otras preguntas

            ## ESTRUCTURA JSON OBLIGATORIA
                Responde SIEMPRE con esta estructura exacta:
                {
                "respuesta": "mensaje de ## BIENVENIDA",
                "isOnlySaludo": true,
                }
            ## EJEMPLOS DE RESPUESTAS VÁLIDAS

                Pregunta: "Hola, buen dia"
                {
                "respuesta": "mensaje de ## BIENVENIDA",
                "isOnlySaludo": true
                }

                Pregunta: "Hola, quisiera saber donde puedo encontrar una tienda de ropa"
                {
                "respuesta": "SIN mesaje de ## BIENVENIDA",
                 "isOnlySaludo": false
                }

            ## RECORDATORIO FINAL
                Tu respuesta DEBE ser únicamente el objeto JSON. Sin texto adicional. Sin explicaciones. Solo JSON.
            `
    },
};

export { PROMPT_TEMPLATES };