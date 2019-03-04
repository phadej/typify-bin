all : test 

.PHONY : all test eslint david example

SRC=lib/*.js bin/typify.js

BINDIR=node_modules/.bin

DAVID=$(BINDIR)/david
ESLINT=$(BINDIR)/eslint

test : eslint david example

example :
	./bin/typify.js example/all.js

eslint :
	$(ESLINT) $(SRC)

david :
	$(DAVID)
