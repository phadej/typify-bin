all : test 

.PHONY : all test eslint david

SRC=lib/*.js bin/typify.js

BINDIR=node_modules/.bin

DAVID=$(BINDIR)/david
ESLINT=$(BINDIR)/eslint

test : eslint david

eslint :
	$(ESLINT) $(SRC)

david :
	$(DAVID)
