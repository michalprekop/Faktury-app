-- New catalog entry only. Existing documents, defaults and account grants stay unchanged.
INSERT INTO templates(id,name,description,config,created_at,updated_at) VALUES
('manolo-bay','Manolo & Bay','Biela faktúra s logom Manolo & Bay, jemným znakom v hlavičke a svetlobéžovým zvýraznením sumy. Rozloženie podľa Mono 01.','{"layout":"manoloBay","accent":"#F2EEEA","wordmark":"Manolo & Bay","logo":"","footer":"Vystavil: Dominika Vašek\nWeb: manolobay.com\ndominika@manolobay.com"}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
