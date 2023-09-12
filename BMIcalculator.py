#Figure out weight in pounds
yourweight = input("What is your weight in pounds: ")

#part one of formula is weight times 703
dividethis = int(yourweight) * 703

#find out height from feet to inches
urfeet = input("How many feet are you: ")
urinch = input("and inches: ")

#convert feet to inches
inchesconverted = int(urfeet) * 12

#add inches together
totalinch = inchesconverted + int(urinch)

#formula
BMI = str(dividethis / totalinch ** 2)

#round BMI to 2 decimal places
rounded_num = round(float(BMI), 2)

#ANSWER TO YOUR BMI
print("Your BMI is: " + str(rounded_num))

input("Press Enter to Close Application")